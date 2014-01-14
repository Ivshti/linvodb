var nedb = require("nedb");
var mkdirp = require("mkdirp");
var path = require("path");
var _ = require("underscore");

function LinvoDB(dataPath)
{
    var linvodb = { },
        dbPath = path.join(dataPath+"", "db"); // since the object can be from node-webkit, it might be detected as..not a string; so concat it with an empty one
    mkdirp.sync(dbPath);
    
    /* The model constructor - this creates a model
     */
    linvodb.models = {}; // An easy way to access all models
    linvodb.Model = function Model(name, schema, options)
    {
        options = options || {};
        if (typeof(name) != "string") throw new Error("model name must be a string");
        if (typeof(schema) != "object") throw new Error("model schema must be an object");
        
        var db = new nedb({ filename: path.join(dbPath, name), autoload: true });
        
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

        /* The instance constructor
         */
        var model = linvodb.models[name] = function Document(doc) 
        {
            //var instance = doc; // TODO: create an empty object from the schema and extend it with doc
            // TODO: genete an _id
            _.extend(this, baseDoc, doc || {});
            this.validate();
        };
        
        /* Instance methods
         */
        model.prototype.validate = function()
        {
            console.log("validating ",this);
        };
        model.prototype.save = function(cb)
        {
            //this.validate()
            db.update({ _id: this._id }, { $set: this }, { upsert: true }, cb);
            console.log("saving ",this);
        };
        model.prototype.remove = function(cb) { db.remove({ _id: this._id }, cb) };
        
        
        /* Static methods
         */
        //model.virtual
        //model.static
        //model.method
        
        model.find = function(query, cb) 
        {
            db.find(query, function(err, res)
            {
                cb(err, res && res.map(function(x) { return new model(x) }));
            });
        };
        model.count = function(query, cb) { db.count(query, cb) };
        model.remove = function(query, options, callback) { db.remove(query, options, callback) };
        model.update = function(query, update, options, callback) { db.update(query, update, options, callback) };
        model.insert = function(docs, cb) { db.insert(docs, cb) };
        //model.findOne
        //model.remove
        //model.update
        //model.count
        //model.insert

        model.store = db;
        return model;
    };
    
    /*
     * events: updated [ids]
     */
    
    return linvodb;
};

module.exports = LinvoDB;
