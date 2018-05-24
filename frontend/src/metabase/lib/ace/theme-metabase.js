/*global ace*/
/* eslint "import/no-commonjs": 0 */
ace.define(
  "ace/theme/metabase",
  ["require", "exports", "module", "ace/lib/dom"],
  function(require, exports, module) {
    exports.isDark = false;
    exports.cssClass = "ace-metabase";
    exports.cssText =
      '\
.ace-metabase .ace_gutter {\
background: rgb(220,236,249);\
color: #509EE3;\
font-weight: bold;\
}\
.ace-metabase  {\
background: #fff;\
color: #000;\
}\
.ace-metabase .ace_keyword {\
font-weight: bold;\
}\
.ace-metabase .ace_string {\
color: #A989C5;\
font-weight: bold;\
}\
.ace-metabase .ace_variable.ace_class {\
color: teal;\
}\
.ace-metabase .ace_constant.ace_numeric {\
color: #6EA637;\
}\
.ace-metabase .ace_constant.ace_buildin {\
color: #0086B3;\
}\
.ace-metabase .ace_support.ace_function {\
color: #0086B3;\
}\
.ace-metabase .ace_comment {\
color: #998;\
font-style: italic;\
}\
.ace-metabase .ace_variable.ace_language  {\
color: #0086B3;\
}\
.ace-metabase .ace_paren {\
font-weight: bold;\
}\
.ace-metabase .ace_boolean {\
font-weight: bold;\
}\
.ace-metabase .ace_string.ace_regexp {\
color: #009926;\
font-weight: normal;\
}\
.ace-metabase .ace_variable.ace_instance {\
color: teal;\
}\
.ace-metabase .ace_constant.ace_language {\
font-weight: bold;\
}\
.ace-metabase .ace_cursor {\
color: black;\
}\
.ace-metabase.ace_focus .ace_marker-layer .ace_active-line {\
background: rgb(255, 255, 204);\
}\
.ace-metabase .ace_marker-layer .ace_active-line {\
background: rgb(245, 245, 245);\
}\
.ace-metabase .ace_marker-layer .ace_selection {\
background: rgb(181, 213, 255);\
}\
.ace-metabase.ace_multiselect .ace_selection.ace_start {\
box-shadow: 0 0 3px 0px white;\
}\
.ace-metabase.ace_nobold .ace_line > span {\
font-weight: normal !important;\
}\
.ace-metabase .ace_marker-layer .ace_step {\
background: rgb(252, 255, 0);\
}\
.ace-metabase .ace_marker-layer .ace_stack {\
background: rgb(164, 229, 101);\
}\
.ace-metabase .ace_marker-layer .ace_bracket {\
margin: -1px 0 0 -1px;\
border: 1px solid rgb(192, 192, 192);\
}\
.ace-metabase .ace_gutter-active-line {\
background-color : rgba(0, 0, 0, 0.07);\
}\
.ace-metabase .ace_marker-layer .ace_selected-word {\
background: rgb(250, 250, 255);\
border: 1px solid rgb(200, 200, 250);\
}\
.ace-metabase .ace_invisible {\
color: #BFBFBF\
}\
.ace-metabase .ace_print-margin {\
width: 1px;\
background: #e8e8e8;\
}\
.ace-metabase .ace_indent-guide {\
background: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAAE0lEQVQImWP4////f4bLly//BwAmVgd1/w11/gAAAABJRU5ErkJggg==") right repeat-y;\
}';

    let dom = require("../lib/dom");
    dom.importCssString(exports.cssText, exports.cssClass);
  },
);
