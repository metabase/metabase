
define(function(require, exports, module) {

var CEHighlightRules = function() {

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
        "start" : sqlRules
    };
};

exports.CEHighlightRules = CEHighlightRules;
});
