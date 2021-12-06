import "brace/mode/java";

class ExpressionHighlight extends window.ace.acequire(
  "ace/mode/text_highlight_rules",
).TextHighlightRules {
  constructor() {
    super();

    this.$rules = {
      start: [
        {
          token: "string",
          regex: '".*?"',
        },
        {
          token: "constant.numeric",
          regex: "[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b",
        },
        {
          token: "variable",
          regex: "[[a-zA-Z0-9_s→]+\\]",
        },
        {
          token: "paren.lparen",
          regex: "[[(]",
        },
        {
          token: "paren.rparen",
          regex: "[\\])]",
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
