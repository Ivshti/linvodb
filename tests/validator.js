var _ = require("underscore");
var validate = require("../validate");

var obj = {
    firstName: "Ivo",
    lastName: "Georgiev",
    email: "ivo@linvo.com",
    phone: "+359889625851",
    birth: "1994/12/10", // tests typecasting
    tags: ["business", "personal",3,5], // adding two numbers to see if they would be filtered
    linked_accounts: [
        { type: "facebook", id: "223" }, // id tests typecasting
        { type: "twitter", id: 55235 },
        { type: "test" },
    ],
    addon: "some addon data",
    more_addon: "more addondata",
    test: [0,0,0,0]
};

var schema = {
    firstName: "string",
    lastName: "string",
    email: { type: "string", index: true },
    phone: "string",
    fax: { type: "string", default: "fax placeholder" },
    birth: "date",
    tags: ["string"],
    description: "string",
    linked_accounts: [{ type: "string", id: "number" }],
    address: {
        city: "string",
        line: "string"
    },
    test: ["number"]
};

// Desired result
var desiredResult = {
    firstName: "Ivo",
    lastName: "Georgiev",
    email: "ivo@linvo.com",
    phone: "+359889625851",
    fax: "fax placeholder",
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
    },
    test: [0,0,0,0]
};

var result = validate(obj, schema);
console.log(result);
console.log("is equal to expected result =>", _.isEqual(desiredResult, result));
