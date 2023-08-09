import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color, darken } from "metabase/lib/colors";

const aceEditorStyle = css`
  .ace_editor {
    height: 100%;
    background-color: ${color("bg-light")};
    color: ${color("text-dark")};
  }

  .ace_search {
    font-family: Lato;
    background-color: ${color("bg-light")};
    color: ${color("text-dark")};
    border-color: ${color("border")};
    padding-bottom: 2px;
  }

  .ace_search_field,
  .ace_searchbtn,
  .ace_button {
    background-color: ${color("white")};
    border-radius: 5px;
    border: 1px solid ${color("border")};
  }

  .ace_nomatch {
    border-radius: 5px;
    outline: 1px solid ${color("error")};
  }

  .ace_searchbtn {
    margin-left: 2px;
  }

  .ace_button {
    padding: 2px 4px;
  }

  .ace_editor .ace_keyword {
    color: ${color("saturated-purple")};
  }

  .ace_editor .ace_function,
  .ace_editor .ace_variable {
    color: ${color("saturated-blue")};
  }

  .ace_editor .ace_constant,
  .ace_editor .ace_type {
    color: ${color("saturated-red")};
  }

  .ace_editor .ace_string {
    color: ${color("saturated-green")};
  }

  .ace_editor .ace_templateTag {
    color: ${color("brand")};
  }

  .react-resizable {
    position: relative;
  }

  .react-resizable-handle {
    position: absolute;
    width: 100%;
    height: 10px;
    bottom: -5px;
    cursor: ns-resize;
  }

  .ace_editor.read-only .ace_cursor {
    display: none;
  }

  .ace_editor .ace_gutter-cell {
    padding-top: 2px;
    font-size: 10px;
    font-weight: 700;
    color: ${color("text-light")};
    padding-left: 0;
    padding-right: 7px;
    display: block;
    text-align: center;
  }

  .ace_editor .ace_gutter {
    background-color: ${color("bg-light")};
  }
`;

export const NativeQueryEditorRoot = styled.div`
  ${aceEditorStyle}
`;

export const DragHandleContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;

  width: 100%;
  height: 8px;

  position: absolute;
  bottom: -4px;

  cursor: row-resize;
`;

export const DragHandle = styled.div`
  width: 100px;
  height: 5px;
  background-color: ${darken("border", 0.03)};
  border-radius: 4px;
`;
