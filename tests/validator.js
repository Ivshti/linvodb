var _ = require("underscore");
var validate = require("../validate");

var obj = {
    firstName: "Ivo",
    lastName: "Georgiev",
    phone: "+359889625851",
    birth: new Date("1994/12/10"),
    tags: ["business", "personal",3,5], // adding two numbers to see if they would be filtered
    linked_accounts: [
        { type: "facebook", id: "test" },
        { type: "twitter", id: "test" }
    ],
    addon: "some addon data"
};

var schema = {
    firstName: "string",
    lastName: "string",
    phone: "string",
    birth: "date",
    tags: ["string"],
    linked_accounts: [{ type: "string", id: "string" }]
};

// Desired result
var result = {
    firstName: "Ivo",
    lastName: "Georgiev",
    phone: "+359889625851",
    birth: new Date("1994/12/10"),
    tags: ["business", "personal"],
    linked_accounts: [
        { type: "facebook", id: "test" },
        { type: "twitter", id: "test" }
    ]
};

console.log(validate(obj, schema));
console.log(_.isEqual(result, validate(obj, schema)));
