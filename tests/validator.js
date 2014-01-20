var _ = require("underscore");
var validate = require("../validate");

var obj = {
    firstName: "Ivo",
    lastName: "Georgiev",
    phone: "+359889625851",
    birth: "1994/12/10", // tests typecasting
    tags: ["business", "personal",3,5], // adding two numbers to see if they would be filtered
    linked_accounts: [
        { type: "facebook", id: "223" }, // id tests typecasting
        { type: "twitter", id: 55235 },
        { type: "test" },
    ],
    addon: "some addon data"
};

var schema = {
    firstName: "string",
    lastName: "string",
    phone: "string",
    birth: "date",
    tags: ["string"],
    description: "string",
    linked_accounts: [{ type: "string", id: "number" }],
    address: {
        city: "string",
        line: "string"
    }
};

// Desired result
var result = {
    firstName: "Ivo",
    lastName: "Georgiev",
    phone: "+359889625851",
    birth: new Date("1994/12/10"),
    tags: ["business", "personal"],
    description: "",
    linked_accounts: [
        { type: "facebook", id: 223 },
        { type: "twitter", id: 55235 },
        { type: "test", id: 0 },        
    ],
    address: {
        city: "", line: ""
    }
};

console.log(validate(obj, schema));
console.log("is equal to expected result =>", _.isEqual(result, validate(obj, schema)));
