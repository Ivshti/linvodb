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

    /* Inflate the schema object / create the base document
     */
    var fullSchema = {};
    _.each(schema, function(val, key)
    {
        if (typeof(val) == "object" && val.type) fullSchema[key] = val;
        fullSchema[key] = { type: val };
    }); 
    
    /* Create indexes
     */
    
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
    
    /* Instance methods
     */
    model.prototype.validate = function() { validator(this, schema) };
    
    model.prototype.save = function(cb)
    {
        this.validate();
        var doc = this.toObject(), // we need to copy this in order to avoid Document instances getting into NeDB
            self = this,
            callback = hookEvent("updated", function(err)
            { 
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
            cb && cb(err, res && res.map(toModelInstance));
        });
    };
    model.count = function(query, cb) { db.count(query, cb) };
    
    model.live = function(query)
    {
        var handle = { res: [], err: null };
        var update = function()
        { 
            model.find(query, function(err, res)
            { 
                handle.err = err; handle.res = res; 
                model.emit("liveQueryUpdate"); 
            });
        };
        update();
        model.on("updated", update);
        
        return handle;
    };

    // Modification
    model.remove = function(query, options, cb) {
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
