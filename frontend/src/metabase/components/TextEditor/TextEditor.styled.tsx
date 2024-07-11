import styled from "@emotion/styled";

import { alpha, color } from "metabase/lib/colors";

export const TextEditorRoot = styled.div`
  color: #000;
  background: #fff;

  .ace_gutter {
    background: rgb(220, 236, 249);
    color: ${color("brand")};
    font-weight: bold;
  }

  .ace_keyword {
    font-weight: bold;
  }

  .ace_string {
    color: #a989c5;
    font-weight: bold;
  }

  .ace_variable.ace_class {
    color: teal;
  }

  .ace_constant.ace_numeric {
    color: #6ea637;
  }

  .ace_constant.ace_buildin {
    color: #0086b3;
  }

  .ace_support.ace_function {
    color: #0086b3;
  }

  .ace_comment {
    color: #998;
    font-style: italic;
  }

  .ace_variable.ace_language {
    color: #0086b3;
  }

  .ace_paren {
    font-weight: bold;
  }

  .ace_boolean {
    font-weight: bold;
  }

  .ace_string.ace_regexp {
    color: #009926;
    font-weight: normal;
  }

  .ace_variable.ace_instance {
    color: teal;
  }

  .ace_constant.ace_language {
    font-weight: bold;
  }

  .ace_cursor {
    color: black;
  }

  .ace-metabase.ace_focus .ace_marker-layer .ace_active-line {
    background: rgb(255, 255, 204);
  }

  .ace_marker-layer .ace_active-line {
    background: rgb(245, 245, 245);
  }

  .ace_marker-layer .ace_selection {
    background: rgb(181, 213, 255);
  }

  .ace-metabase.ace_multiselect .ace_selection.ace_start {
    box-shadow: 0 0 3px 0 white;
  }

  .ace-metabase.ace_nobold .ace_line > span {
    font-weight: normal !important;
  }

  .ace_marker-layer .ace_step {
    background: rgb(252, 255, 0);
  }

  .ace_marker-layer .ace_stack {
    background: rgb(164, 229, 101);
  }

  .ace_marker-layer .ace_bracket {
    margin: -1px 0 0 -1px;
    border: 1px solid rgb(192, 192, 192);
  }

  .ace_gutter-active-line {
    background-color: rgba(0, 0, 0, 0.07);
  }

  .ace_marker-layer .ace_selected-word {
    background: rgb(250, 250, 255);
    border: 1px solid rgb(200, 200, 250);
  }

  .ace_invisible {
    color: #bfbfbf;
  }

  .ace_print-margin {
    width: 1px;
    background: #e8e8e8;
  }

  .ace_indent-guide {
    background: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAAE0lEQVQImWP4////f4bLly//BwAmVgd1/w11/gAAAABJRU5ErkJggg==")
      right repeat-y;
  }

  .highlighted-code-marker {
    position: absolute;
    background: ${alpha(color("accent4"), 0.3)};
  }

  .highlighted-code-marker-row-number {
    background: ${alpha(color("accent4"), 0.5)};
  }
`;
