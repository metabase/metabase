import "brace/mode/java";

class ExpressionHighlight extends window.ace.acequire(
  "ace/mode/text_highlight_rules",
).TextHighlightRules {
  constructor() {
    super();

    this.$rules = {
      start: [
        {
          token: "aggregation",
          regex:
            "Average|CountIf|CumulativeCount|CumulativeSum|Median|Min|Max|Percentile|Share|StandardDeviation|SumIf|Variance",
        },
        {
          token: "boolean",
          regex:
            "between|contains|endsWith|interval|isempty|isnull||startsWith",
        },
        {
          token: "constant.numeric",
          regex: "[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b",
        },
        {
          token: "string",
          regex: '["](?:(?:\\\\.)|(?:[^"\\\\]))*?["]',
        },
        {
          token: "string",
          regex: "['](?:(?:\\\\.)|(?:[^'\\\\]))*?[']",
        },
        {
          token: "variable",
          regex: "\\[.+\\]",
        },
        {
          token: "paren.lparen",
          regex: "[(]",
        },
        {
          token: "paren.rparen",
          regex: "[)]",
        },
        {
          token: "keyword",
          regex: "or|and|not|OR|AND|NOT",
        },
        {
          token: "keyword.operator",
          regex: "[+-/*=<>]",
        },
      ],
    };
  }
}

export default class ExpressionMode extends window.ace.acequire("ace/mode/java")
  .Mode {
  constructor() {
    super();
    this.HighlightRules = ExpressionHighlight;
  }
}
