var nedb = require("nedb");
var mkdirp = require("mkdirp");
var path = require("path");

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
        var instanceMethods = { };
        
        /* The instance constructor
         */
        var model = linvodb.models[name] = function(doc) 
        {
        };
        
        model.store = db;
        return model;
    };
    
    /*
     * events: updated [ids]
     */
    
    return linvodb;
};

module.exports = LinvoDB;
