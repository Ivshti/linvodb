var nedb = require("nedb");
var mkdirp = require("mkdirp");
var path = require("path");
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
    options = options || {};
    
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
            self = this,
            callback = hookEvent("updated", function(err)
            {
                if (!self._id && doc._id && doc._ttl)
                    setTimeout(function() { model.emit("updated") }, doc._ttl); // Hack: if the document is short-lived, it would be good to do this
                
                _.extend(self, { _id: doc._id, _ctime: doc._ctime });
                cb && cb(err, self);
            });

        db.findOne({ _id: doc._id }, function(err, isIn)
        {
            if (isIn) db.update({ _id: doc._id }, doc, {}, callback);
            else db.insert(doc, callback);
        });
    };
    model.prototype.remove = function(cb) { db.remove({ _id: this._id }, hookEvent("updated", cb)) };
    
    model.prototype.toObject = function()
    {
        var obj = {};
        _.each(this, function(val, key)
        { 
            if (! _.contains(["$$hashKey"], key)) // we can add other excludes
                obj[key] = val;
        });
        return obj;
    };
    model.prototype.copy = function() { return new model(this.toObject()) };

    /* Statics: standard DB operations
     */
    // Query
    model.find = function(query, cb) 
    {
        db.find(query, function(err, res)
        {
            cb && cb(err, res && res.map(toModelInstance).filter(removeExpired));
        });
    };
    model.count = function(query, cb) { db.count(query, cb) };
    
    model.live = function(query, options)
    {
        options = options || {};
        options.aggregate = options.aggregate || function(res, cb) { cb(res) };

        var handle = { res: [], err: null };
        var update = function()
        { 
            model.find(query, function(err, res)
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
        
        return handle;
    };

    // Modification
    model.remove = function(query, options) {
        var cb = (typeof(arguments[arguments.length-1]) == "function") && arguments[arguments.length-1];
            options = (options && typeof(options)=="object") ? options : {};
        db.remove(query, options, hookEvent("updated", cb))
    };
    model.update = function(query, update, options, cb) { 
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
