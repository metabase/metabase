/*global ace*/
/* eslint-disable import/no-commonjs */

ace.define(
  "ace/mode/mbce",
  [
    "require",
    "exports",
    "ace/lib/oop",
    "ace/mode/text",
    "ace/mode/text_highlight_rules",
  ],
  function(require, exports) {
    const oop = require("ace/lib/oop");
    const TextMode = require("ace/mode/text").Mode;

    const TextHighlightRules = require("ace/mode/text_highlight_rules")
      .TextHighlightRules;

    const CEHighlightRules = function() {
      const keywords = "AND|OR|NOT";

      const builtinFunctions =
        "abs|between|case|ceil|coalesce|concat|contains|endsWith|exp|floor|interval|length|log|lower|ltrim|power|regexextract|replace|" +
        "round|rtrim|sqrt|startsWith|substring|trim|upper|" +
        "Average|Count|CountIf|CumulativeCount|CumulativeSum|Distinct|Max|Median|Min|Percentile|Share|StandardDeviation|Sum|Variance";

      const keywordMapper = this.createKeywordMapper(
        {
          "support.function": builtinFunctions,
          keyword: keywords,
        },
        "identifier",
        true,
      );

      const sqlRules = [
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

    const CEMode = function() {
      this.HighlightRules = CEHighlightRules;
    };

    oop.inherits(CEMode, TextMode);

    module.exports.CEMode = CEMode;
  },
);
