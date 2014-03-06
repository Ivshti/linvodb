var nedb = require("nedb");
var mkdirp = require("mkdirp");
var path = require("path");
var async = require("async");
var mpath = require("mpath");
var _ = require("underscore");
var EventEmitter = require("events").EventEmitter;
var validator = require("./validate");
var setupSync = require("./sync");

var linvodb = { };

linvodb.init = function(dataPath)
{
    linvodb.dbPath = path.join(dataPath+"", "db"); // since the object can be from node-webkit, it might be detected as..not a string; so concat it with an empty one
    mkdirp.sync(linvodb.dbPath);
};


/* The model constructor - this creates a model
 */
linvodb.models = {}; // An easy way to access all models
linvodb.Model = function Model(name, schema, options)
{
    if (! linvodb.dbPath) throw new Error("must initialize the DB first - .init(dbPath)");
    if (typeof(name) != "string") throw new Error("model name must be a string");
    if (typeof(schema) != "object") throw new Error("model schema must be an object");
    var options = options || {};
    
    var db = new nedb({ filename: path.join(linvodb.dbPath, name), autoload: true });

    /* Create indexes
     */
    function getIndexes(obj, prefix)
    {
        var indexes = [], prefix = prefix || "";
        _.each(obj, function(val, key)
        {
            if (typeof(val) != "object") return;
            if (! validator.isSpecialSpec(val)) // recursively find if we have indexes below
                return indexes = indexes.concat(getIndexes(val, prefix+key+"."));
            if (val.index)  // now we know spec is a special object: add the index
                indexes.push({ fieldName: prefix+key, sparse: val.sparse, unique: val.unique });
        });
        return indexes;
    };
    getIndexes(schema).forEach(function(index) { db.ensureIndex(index) });
    
    /* Small helpers/utilities
     */
    var hookEvent = function(ev, fn) {
        return function() {
            model.emit(ev);
            fn && fn.apply(this, arguments);
        };
    };

    /* The instance constructor
     */
    var model = linvodb.models[name] = function Document(doc) 
    {
        if (doc && doc.constructor.name == "Document")
            return doc;

        _.extend(this, doc || {});
        this.validate();
    };
    var toModelInstance = function(x) { return new model(x) };
    var removeExpired = function(doc)
    { 
        // Remove expired documents
        if (doc._ttl && doc._ctime.getTime()+doc._ttl < Date.now())
        {
            db.remove({ _id: doc._id });
            return false;
        }
        return true;
    };

    /* Instance methods
     */
    model.prototype.validate = function() { validator(this, schema, options) };
    
    model.prototype.save = function(cb)
    {
        this.validate();
        var doc = this.toObject(), // we need to copy this in order to avoid Document instances getting into NeDB
            self = this;

        db.update({ _id: doc._id }, doc, { upsert: true }, hookEvent("updated", function(err, count, newDoc)
        {
            if (err) return cb && cb(err);
            if (newDoc) doc = newDoc; // a new document was inserted

            if (!self._id && doc._id && doc._ttl)
                setTimeout(function() { model.emit("updated") }, doc._ttl); // Hack: if the document is short-lived, it would be good to do this
            
            _.extend(self, _.pick(doc, "_id", "_ctime", "_mtime"));
            cb && cb(null, self);
        }));
    };
    model.prototype.remove = function(cb) { db.remove({ _id: this._id }, hookEvent("updated", cb)) };
    
    model.prototype.toObject = function(validate)
    {
        var obj = {};
        _.each(this, function(val, key)
        { 
            // we can add other excludes; length messes up NeDB big time; TODO: console.log a warning there
            // I can't explain to myself why length messes up NeDB, it has to be figured out
            if (! _.contains(["$$hashKey", "length"], key))
                obj[key] = val;
        });
        
        if (validate) validator(obj, schema, options);
        return obj;
    };
    model.prototype.copy = function() { return new model(this.toObject()) };

    /* 
     * Statics: standard DB operations
     */
    // Live query system - basic for now
    var liveQuery = function(cur, options)
    {
        var options = options || {};
        options.aggregate = options.aggregate || function(res, cb) { cb(res) };

        var handle = { res: [], err: null };
        var update = function()
        {
            // TODO: maybe check if the result is actually different before calling liveQueryUpdate?
            // instead of full-on comparison we can just do _mtime arrays
            cur.exec(function(err, res)
            {
                options.aggregate(res, function(res)
                {
                    handle.err = err; handle.res = res; 
                    model.emit("liveQueryUpdate");               
                });
            });
        };
        update();
        model.on("updated", update);
        // OR we can figure out if there are going to be modifications before actually re-quering
        // this is far more difficult so there's kind of no point
        
        return handle;
    };
     
    // Query
    model.find = function(query, cb) 
    {
        var cur = db.find(query || { }),
            exec = _.bind(cur.exec, cur),
            toPopulate = [];
            
        cur.exec = function(cb)
        {
            exec(function(err, res)
            {
                var result = res && res.map(toModelInstance).filter(removeExpired);
                
                /* 
                 * 
                 * TODO: implement a hooks system and then use that to populate
                 * 
                 */
                if (result) async.each(toPopulate, function(path, callback)
                {
                    var schm = mpath.get(path, schema);
                    if (Array.isArray(schm)) schm = schm[0];
                    
                    if (! schm.ref) return callback();
                    if (! linvodb.models[schm.ref]) return callback();
                    
                    var ids = _.flatten(result.map(function(x) { return mpath.get(path, x) }))
                        .filter(function(x) { return x });
                    
                    linvodb.models[schm.ref].find({ _id: { $in: ids } }, function(err, docs)
                    {
                        if (err) return callback();
                        
                        var indexed = _.indexBy(docs, "_id");
                        
                        result.forEach(function(res)
                        {
                            var val = mpath.get(path, res);
                            if (Array.isArray(val))
                                mpath.set(path, val.map(function(id) { return indexed[id] }), res);
                            else
                                mpath.set(path, indexed[val], res);
                        });

                        callback();
                    });
                }, function()
                {
                    cb && cb(err, result);
                });                
            });
        };
        cur.live = function(options) { return liveQuery(cur, options) };
        cur.populate = function(path) { toPopulate.push(path); return cur; }
        
        if (cb) cur.exec(cb);
        return cur;
    };
    model.findOne = function(query, cb)
    {
        model.find(query).limit(1).exec(function(err, res) { cb(err, res && res[0]) })
    };
    model.count = function(query, cb) { db.count(query, cb) };
    model.live = function(query, options) { return model.find(query).live(options) };
    
    // Modification
    model.remove = function(query, options)
    {
        var cb = (typeof(arguments[arguments.length-1]) == "function") && arguments[arguments.length-1];
            options = (options && typeof(options)=="object") ? options : {};
        db.remove(query, options, hookEvent("updated", cb))
    };
    model.update = function(query, update, options, cb)
    { 
        db.update(query, update, options, hookEvent("updated", cb))
    };
    model.insert = function(docs, cb)
    { 
        db.insert(
            docs.map(toModelInstance).map(function(doc) { return doc.toObject() }),
            hookEvent("updated", cb)
        )
    };

    // Utils
    model.setupSync = function(api) { setupSync(model, db, api) }; 
    model.ensureIndex = function(options, cb) { db.ensureIndex(options, cb) };

    /* Statics that extend the model
     */
    model.virtual = function(name, fn)
    { 
        Object.defineProperty(model.prototype, name, { get: fn });
    };
    model.method = function(name, fn)
    {
        model.prototype[name] = fn;
    };
    model.static = function(name, fn)
    {
        model[name] = fn;
    };

    // Support event emitting
    _.extend(model, new EventEmitter());

    model.modelName = name;
    model.store = db;
    return model;
};


linvodb.createService = function(module, model)
{
    module.factory(model.modelName, ["$rootScope", function($rootScope) 
    {
        model.on("liveQueryUpdate", function() { $rootScope.$apply() });
        return model;
    }]);
};

module.exports = linvodb;
