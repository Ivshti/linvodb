var nedb = require("nedb");
var mkdirp = require("mkdirp");
var path = require("path");
var _ = require("underscore");
var EventEmitter = require("events").EventEmitter;


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
    
    var baseDoc = {};
    _.each(fullSchema, function(val, key)
    {
        baseDoc[key] = val.default || new val.type();
    });
    
    
    /* Small helpers/utilities
     */
    var hookEvent = function(ev, fn) {
        return function() {
            model.emit(ev);
            fn.apply(this, arguments);
        };
    };

    /* The instance constructor
     */
    var model = linvodb.models[name] = function Document(doc) 
    {
        if (doc && doc.constructor.name == "Document")
            return doc;

        _.extend(this, baseDoc, doc || {});
        this.validate();
    };
    var toModelInstance = function(x) { return new model(x) };
    
    /* Instance methods
     */
    model.prototype.validate = function()
    {
        // TODO
    };
    model.prototype.save = function(cb)
    {
        this.validate();
        var doc = this,
            callback = function(err) { cb && cb(err, doc) };
        
        db.findOne({ _id: doc._id }, function(err, isIn)
        {
            delete doc.$$hashKey; /* This is something from Angular that breaks stuff */
            if (isIn) db.update({ _id: isIn._id }, doc, { }, hookEvent("updated", callback));
            else db.insert(doc, hookEvent("updated", callback));
        });
    };
    model.prototype.remove = function(cb) { db.remove({ _id: this._id }, hookEvent("updated", cb)) };
    
    
    /* Static methods
     */
    //model.virtual
    //model.static
    //model.method
    
    // Query
    model.find = function(query, cb) 
    {
        db.find(query, function(err, res)
        {
            cb(err, res && res.map(toModelInstance));
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
    model.remove = function(query, options, cb) { db.remove(query, options, hookEvent("updated", cb)) };
    model.update = function(query, update, options, cb) { db.update(query, update, options, hookEvent("updated", cb)) };
    model.insert = function(docs, cb) { db.insert(docs.map(toModelInstance), hookEvent("updated", cb)) };

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
        model.on("update", function() { $rootScope.$apply() });
        model.on("liveQueryUpdate", function() { $rootScope.$apply() });
        return model;
    }]);
};

module.exports = linvodb;
