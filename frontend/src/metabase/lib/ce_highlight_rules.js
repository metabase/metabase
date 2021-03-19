
define(function(require, exports, module) {

var CEHighlightRules = function() {

    // Keywords, functions, operators last updated for pg 9.3.
    var keywords = (
        "AND|OR|NOT"
    );


    var builtinFunctions = (
        "abs|between|case|ceil|coalesce|concat|contains|endsWith|exp|floor|interval|length|log|lower|ltrim|power|regexextract|replace|" +
        "round|rtrim|sqrt|startsWith|substring|trim|upper|" +
        "Average|Count|CountIf|CumulativeCount|CumulativeSum|Distinct|Max|Median|Min|Percentile|Share|StandardDeviation|Sum|Variance"
    );

    var keywordMapper = this.createKeywordMapper({
        "support.function": builtinFunctions,
        "keyword": keywords
    }, "identifier", true);


    var sqlRules = [{
            token : "string", // single line string -- assume dollar strings if multi-line for now
            regex : "['](?:(?:\\\\.)|(?:[^'\\\\]))*?[']"
        }, {
            token : "variable.language", // pg identifier
            regex : '".*?"'
        }, {
            token : "constant.numeric", // float
            regex : "[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b"
        }, {
            token : keywordMapper,
            regex : "[a-zA-Z_][a-zA-Z0-9_$]*\\b" // TODO - Unicode in identifiers
        }, {
            token : "keyword.operator",
            regex : "!|\\*|\\+|" +
                    "\\-|/|<|<=|<>|!=|=|>|>="
        }, {
            token : "paren.lparen",
            regex : "[\\(]"
        }, {
            token : "paren.rparen",
            regex : "[\\)]"
        },
        {
            token: "bracket.lbracket",
            regex: "[\\[]"  
        },
        {
            token: "bracket.rbracket",
            regex: "[\\]]"
        },
        {
            token : "text",
            regex : "\\s+"
        }
    ];


    this.$rules = {
        "start" : [{
                token : "comment",
                regex : "--.*$"
            }, {
                token : "comment", // multi-line comment
                regex : "\\/\\*",
                next : "commentStatement"
            }, {
                token : "statementEnd",
                regex : ";",
                next : "start"
            }
        ].concat(sqlRules),

        "dollarSql" : [{
                token : "comment",
                regex : "--.*$"
            }, {
                token : "comment", // multi-line comment
                regex : "\\/\\*",
                next : "commentDollarSql"
            }, {
                token : "string", // end quoting with dollar at the start of a line
                regex : "^\\$[\\w_0-9]*\\$",
                next : "statement"
            }, {
                token : "string",
                regex : "\\$[\\w_0-9]*\\$",
                next : "dollarSqlString"
            }
        ].concat(sqlRules),

        "comment" : [{
                token : "comment", // closing comment
                regex : "\\*\\/",
                next : "start"
            }, {
                defaultToken : "comment"
            }
        ],

        "commentStatement" : [{
                token : "comment", // closing comment
                regex : "\\*\\/",
                next : "statement"
            }, {
                defaultToken : "comment"
            }
        ],

        "commentDollarSql" : [{
                token : "comment", // closing comment
                regex : "\\*\\/",
                next : "dollarSql"
            }, {
                defaultToken : "comment"
            }
        ],

        "dollarStatementString" : [{
                token : "string", // closing dollarstring
                regex : ".*?\\$[\\w_0-9]*\\$",
                next : "statement"
            }, {
                token : "string", // dollarstring spanning whole line
                regex : ".+"
            }
        ],

        "dollarSqlString" : [{
                token : "string", // closing dollarstring
                regex : ".*?\\$[\\w_0-9]*\\$",
                next : "dollarSql"
            }, {
                token : "string", // dollarstring spanning whole line
                regex : ".+"
            }
        ]
    };
};

exports.CEHighlightRules = CEHighlightRules;
});
