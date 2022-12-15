import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const EditorContainer = styled.div`
  border: 1px solid;
  border-color: ${color("border")};
  border-radius: ${space(0)};
  display: flex;
  position: relative;
  margin: ${space(1)} 0;
  padding: 12px ${space(1)};
  transition: border 0.3s linear;

  ${({ isFocused }) =>
    isFocused &&
    css`
      border-color: ${color("brand")};
    `}

  ${({ hasError }) =>
    hasError &&
    css`
      border-color: ${color("error")};
    `}

  @media (prefers-reduced-motion) {
    transition: none;
  }

  .ace_editor {
    overflow: initial;
  }

  textarea {
    min-height: 5px;
  }

  .ace_content * {
    font-family: monospace !important;
  }

  .ace_hidpi .ace_content {
    color: ${color("text-dark")};
    font-weight: 700;
  }

  .ace-tm .ace_keyword,
  .ace-tm .ace_constant.ace_numeric {
    color: ${color("text-dark")};
  }

  .ace-tm .ace_variable {
    color: ${color("brand")};
  }

  .ace-tm .ace_string {
    color: ${color("accent5")};
  }

  .ace_cursor {
    border-left-width: 1px;
  }

  .ace_hidden-cursors .ace_cursor {
    opacity: 0;
  }

  .ace_content .error {
    position: absolute;
    border-bottom: 2px solid ${color("error")};
    border-radius: 0px;
    background-color: ${color("bg-error")};
  }
`;

EditorContainer.defaultProps = {
  className: "expression-editor-textfield",
};

export const EditorEqualsSign = styled.div`
  font: 12px / normal "Monaco", monospace;
  height: 12px;
  font-weight: 700;
  margin: 0 3px 0 ${space(0)};
`;
