/*global ace*/
/* eslint "import/no-commonjs": 0 */
ace.define(
  "ace/theme/metabase",
  ["require", "exports", "module", "ace/lib/dom"],
  function(require, exports, module) {
    exports.isDark = false;
    exports.cssClass = "ace-metabase";
    exports.cssText =
      `.ace-metabase .ace_gutter {background: ${colors["bg-medium"]};color: ${colors.brand};font-weight: bold;}.ace-metabase  {background: ${colors["text-white"]};color: ${colors["text-dark"]};}.ace-metabase .ace_keyword {font-weight: bold;}.ace-metabase .ace_string {color: ${colors.accent2};font-weight: bold;}.ace-metabase .ace_variable.ace_class {color: teal;}.ace-metabase .ace_constant.ace_numeric {color: ${colors.success};}.ace-metabase .ace_constant.ace_buildin {color: ${colors.brand};}.ace-metabase .ace_support.ace_function {color: ${colors.brand};}.ace-metabase .ace_comment {color: ${colors["text-medium"]};font-style: italic;}.ace-metabase .ace_variable.ace_language  {color: ${colors.brand};}.ace-metabase .ace_paren {font-weight: bold;}.ace-metabase .ace_boolean {font-weight: bold;}.ace-metabase .ace_string.ace_regexp {color: ${colors.success};font-weight: normal;}.ace-metabase .ace_variable.ace_instance {color: teal;}.ace-metabase .ace_constant.ace_language {font-weight: bold;}.ace-metabase .ace_cursor {color: black;}.ace-metabase.ace_focus .ace_marker-layer .ace_active-line {background: ${colors["text-white"]};}.ace-metabase .ace_marker-layer .ace_active-line {background: ${colors["bg-light"]};}.ace-metabase .ace_marker-layer .ace_selection {background: ${colors["text-light"]};}.ace-metabase.ace_multiselect .ace_selection.ace_start {box-shadow: 0 0 3px 0px white;}.ace-metabase.ace_nobold .ace_line > span {font-weight: normal !important;}.ace-metabase .ace_marker-layer .ace_step {background: ${colors.accent4};}.ace-metabase .ace_marker-layer .ace_stack {background: ${colors.success};}.ace-metabase .ace_marker-layer .ace_bracket {margin: -1px 0 0 -1px;border: 1px solid ${colors["text-light"]};}.ace-metabase .ace_gutter-active-line {background-color : ${colors["text-dark"]};}.ace-metabase .ace_marker-layer .ace_selected-word {background: ${colors["bg-light"]};border: 1px solid ${colors["text-light"]};}.ace-metabase .ace_invisible {color: ${colors["text-light"]}}.ace-metabase .ace_print-margin {width: 1px;background: ${colors["text-light"]};}.ace-metabase .ace_indent-guide {background: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAAE0lEQVQImWP4////f4bLly//BwAmVgd1/w11/gAAAABJRU5ErkJggg==") right repeat-y;}`;

    let dom = require("../lib/dom");
    dom.importCssString(exports.cssText, exports.cssClass);
  },
);
