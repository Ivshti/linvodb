var _ = require("underscore");

var screens = {
    ObjectId: /[0-9a-fA-F]{24}/,
    'string': function(value) {
        if (typeof value === 'string') return value;
    },
    'number': function(value) {
        if (typeof value === 'number') return value;
    },
    'boolean': function(value) {
        if (typeof value === 'boolean') return value;
    },
    'date': function(value) {
        if (value instanceof Date) return value;
    },
    'regexp': function(value) {
        if (value instanceof RegExp) return value;
    },
    'function': function(value) {
        if (typeof value === 'function') return value;
    },
    'object': function(value) {
        if (typeof value === 'object') return value;
    }
};

function specType(spec) {
    if (typeof spec === 'object') {
        if (Array.isArray(spec)) return "array";
        if (spec === null) return "null";
        return 'object';
    } else return typeof spec;
}

function canCast(val, spec)
{
    if (spec == "string" && val.toString) return true;
    if (spec == "number" && !isNaN(val)) return true;
    if (spec == "date" && !isNaN(new Date(val).getTime())) return true;
    return false;
}
function castToType(val, spec)
{
    if (spec == "string") return val.toString();
    if (spec == "number") return parseFloat(val);
    if (spec == "date") return new Date(val);
}

function defaultValue(spec)
{
    var specT = specType(spec);
    if (specT == "array") return [];
    if (specT == "object") return { };
    if (specT == "string") return ({
        "string": "",
        "number": 0,
        "boolean": false,
        "date": new Date(),
        "regexp": new RegExp(),
        "function": function() { },
        "object": {}
    })[spec];
}

var globalSpec = {
    "_id": "string", // TODO: regexp
    "_ctime": "date",
    "_mtime": "date"
};

/* We can pass an object as a spec which really describes a single type, and not a sub-object
 * e.g. { type: "string", index: true }
 * */
var specAllowedKeys = ["type", "index", "unique", "sparse"];

function validate(object, spec)
{
    var result, prop, propResult;

    if (typeof(spec) == "object" 
        && _.keys(spec).every(function(x) { return _.contains(specAllowedKeys, x) })
       ) spec = spec.type;

    var specT = specType(spec);
    if (specT === 'array') {
        if (!Array.isArray(object)) return;
        return object
            .map(function(x) { return validate(x, spec[0]) })
            .filter(function(x) { return x });
    } else if (specT === 'string') {
        return validate(object, screens[spec]);
    } else if (specT === 'function') {
        return spec(object);
    }
    // true means whitelist whole object
    else if (specT === 'boolean' && spec === true) {
        return object;
    }
    else if (specT === 'regexp' && typeof object === 'string') {
        var reMatch = object.match(spec);
        if (reMatch && reMatch[0].length == object.length) return object;
    } else if (specT === 'object') {
        result = object || {};
        // check for existance of properties in the global spec (which can whitelist fields in any object)
        for (prop in object)
        {
            if (typeof globalSpec[prop] === 'undefined') continue;
            propResult = validate(object[prop], globalSpec[prop]);

            if (typeof propResult !== 'undefined') {
                result[prop] = propResult;
            }
        }

        for (prop in spec)
        {
            if (typeof object[prop] === "undefined")
                result[prop] = defaultValue(spec[prop]);
            
            propResult = validate(object[prop], spec[prop]);

            // Try a typecast - only for dates/strings
            if (!propResult && canCast(object[prop], spec[prop])) 
                propResult = castToType(object[prop], spec[prop]);

            // Set the result value - or a default value if we don't have one
            result[prop] = (typeof propResult !== 'undefined') ? propResult : defaultValue(spec[prop]);
            
            //    throw new Error("Screen failed for: " + prop);            
        }
        
        for (prop in object)
        {
            if (! (spec.hasOwnProperty(prop) || globalSpec.hasOwnProperty(prop)))
                delete object[prop];
        }
        
        return result;
    }
}

validate.define = function(name, screenFunction)
{
    screens[name] = screenFunction;
};

validate.or = function()
{
    var screens = arguments;
    return function(value) {
        var i, res;
        var input = value,
            output;
        for (i = 0; i < screens.length; ++i) {
            res = validate(input, screens[i]);
            if (typeof res !== 'undefined') {
                input = res;
                output = res;
            }
        }
        return output;
    };
};

validate.and = function()
{
    var screens = arguments;
    return function(value) {
        var i;
        var res = value;
        for (i = 0; i < screens.length; ++i) {
            res = validate(res, screens[i]);
            if (typeof res === 'undefined') return undefined;
        }
        return res;
    };
};

module.exports = validate;
