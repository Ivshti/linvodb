var nedb = require("nedb");
var mkdirp = require("mkdirp");
var path = require("path");

function LinvoDB(dataPath)
{
    var linvodb = {},
        dbPath = path.join(dataPath+"", "db"); // since the object can be from node-webkit, it might be detected as..not a string; so concat it with an empty one

    mkdirp.sync(dbPath);
    

    return linvodb;
};

module.exports = LinvoDB;
