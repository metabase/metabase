import { css, type Theme } from "@emotion/react";
import styled from "@emotion/styled";
import type { ResizableBoxProps } from "react-resizable";
import { ResizableBox } from "react-resizable";

import QueryBuilderS from "metabase/css/query_builder.module.css";
import { darken } from "metabase/lib/colors";

const getAceEditorStyle = (theme: Theme) => css`
  .ace_editor {
    height: 100%;
    background-color: var(--mb-color-bg-light);
    color: ${theme.fn.themeColor("text-dark")};
  }

  .ace_search {
    font-family: Lato;
    background-color: var(--mb-color-bg-light);
    color: ${theme.fn.themeColor("text-dark")};
    border-color: var(--mb-color-border);
    padding-bottom: 2px;
  }

  .ace_search_field,
  .ace_searchbtn,
  .ace_button {
    background-color: var(--mb-color-bg-white);
    border-radius: 5px;
    border: 1px solid var(--mb-color-border);
  }

  .ace_nomatch {
    border-radius: 5px;
    outline: 1px solid ${theme.fn.themeColor("error")};
  }

  .ace_searchbtn {
    margin-left: 2px;
  }

  .ace_button {
    padding: 2px 4px;
  }

  .ace_editor .ace_keyword {
    color: ${theme.fn.themeColor("saturated-purple")};
  }

  .ace_editor .ace_function,
  .ace_editor .ace_variable {
    color: ${theme.fn.themeColor("saturated-blue")};
  }

  .ace_editor .ace_constant,
  .ace_editor .ace_type {
    color: ${theme.fn.themeColor("saturated-red")};
  }

  .ace_editor .ace_string {
    color: ${theme.fn.themeColor("saturated-green")};
  }

  .ace_editor .ace_templateTag {
    color: ${theme.fn.themeColor("brand")};
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
    color: ${theme.fn.themeColor("text-light")};
    padding-left: 0;
    padding-right: 7px;
    display: block;
    text-align: center;
  }

  .ace_editor .ace_gutter {
    background-color: var(--mb-color-bg-light);
  }
`;

export const getAceEditorStyles = (theme: Theme) => css`
  .ace_editor.ace_autocomplete {
    border: none;
    box-shadow: 0 2px 3px 2px rgba(0, 0, 0, 0.08);
    border-radius: 4px;
    background-color: white;
    color: #4c5773;
    width: 520px;
  }

  .ace_editor.ace_autocomplete .ace_marker-layer .ace_active-line,
  .ace_editor.ace_autocomplete .ace_marker-layer .ace_line-hover {
    background-color: ${theme.fn.themeColor("brand-light")};
    border: none;
    outline: none;
  }

  .ace_completion-highlight {
    color: ${theme.fn.themeColor("brand")};
  }

  .ace_editor.ace_autocomplete .ace_line {
    font-weight: bold;
    padding-left: 4px;
  }

  .ace_editor.ace_autocomplete .ace_completion-meta {
    font-weight: 400;
  }
`;

export const NativeQueryEditorRoot = styled.div`
  width: 100%;
  background-color: var(--mb-color-bg-light);

  ${({ theme }) => getAceEditorStyle(theme)}

  .${QueryBuilderS.GuiBuilderData} {
    border-right: none;
  }
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
  background-color: ${() => darken("border", 0.03)};
  border-radius: 4px;
`;

export const EditorRoot = styled.div`
  flex: 1 0 auto;
`;

export const StyledResizableBox = styled(ResizableBox)<
  ResizableBoxProps & {
    isOpen: boolean;
  }
>`
  display: ${props => (props.isOpen ? "flex" : "none")};
  border-top: 1px solid var(--mb-color-border);
`;
