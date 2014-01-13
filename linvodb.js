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
        
        var model = linvodb.models[name] = { };
        var db = model.store = new nedb({ filename: path.join(dbPath, name), autoload: true });// expose that
        
        // TODO: err check, validation
    };
    
    /*
     * events: updated [ids]
     */
    
    return linvodb;
};

module.exports = LinvoDB;
