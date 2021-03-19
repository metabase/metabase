ace.define(
  "ace/mode/mbce",
  [
    "require",
    "exports",
    "ace/lib/oop",
    "ace/mode/text",
    "ace/mode/mbce_highlight_rules",
  ],
  (require, exports) => {
    const oop = require("ace/lib/oop");
    const TextMode = require("ace/mode/text").Mode;
    const CEHighlightRules = require("ace/mode/mbce_highlight_rules")
      .CEHighlightRules;

    var Mode = function() {
      this.HighlightRules = TextHighlightRules;
    };

    oop.inherits(Mode, TextMode);

    exports.Mode = Mode;
  },
);

ace.define(
  "ace/mode/mbce_highlight_rules",
  [
    "require",
    "exports",
    "module",
    "ace/lib/oop",
    "ace/mode/text_highlight_rules",
  ],
  function(require, exports, module) {
    const oop = require("ace/lib/oop");
    const TextHighlightRules = require("ace/mode/text_highlight_rules")
      .TextHighlightRules;

    var CEHighlightRules = function() {
      var keywords = "AND|OR|NOT";

      var builtinFunctions =
        "abs|between|case|ceil|coalesce|concat|contains|endsWith|exp|floor|interval|length|log|lower|ltrim|power|regexextract|replace|" +
        "round|rtrim|sqrt|startsWith|substring|trim|upper|" +
        "Average|Count|CountIf|CumulativeCount|CumulativeSum|Distinct|Max|Median|Min|Percentile|Share|StandardDeviation|Sum|Variance";

      var keywordMapper = this.createKeywordMapper(
        {
          "support.function": builtinFunctions,
          keyword: keywords,
        },
        "identifier",
        true,
      );

      var sqlRules = [
        {
          token: "string", // single line string -- assume dollar strings if multi-line for now
          regex: "['](?:(?:\\\\.)|(?:[^'\\\\]))*?[']",
        },
        {
          token: "variable.language", // pg identifier
          regex: '".*?"',
        },
        {
          token: "constant.numeric", // float
          regex: "[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b",
        },
        {
          token: keywordMapper,
          regex: "[a-zA-Z_][a-zA-Z0-9_$]*\\b", // TODO - Unicode in identifiers
        },
        {
          token: "keyword.operator",
          regex: "!|\\*|\\+|" + "\\-|/|<|<=|<>|!=|=|>|>=",
        },
        {
          token: "paren.lparen",
          regex: "[\\(]",
        },
        {
          token: "paren.rparen",
          regex: "[\\)]",
        },
        {
          token: "bracket.lbracket",
          regex: "[\\[]",
        },
        {
          token: "bracket.rbracket",
          regex: "[\\]]",
        },
        {
          token: "text",
          regex: "\\s+",
        },
      ];

      this.$rules = {
        start: sqlRules,
      };
    };

    oop.inherits(CEHighlightRules, TextHighlightRules);

    exports.CEHighlightRules = CEHighlightRules;
  },
);
