import { css } from "@emotion/react";
import styled from "@emotion/styled";

import QueryBuilderS from "metabase/css/query_builder.module.css";

export const aceEditorStyles = css`
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
    background-color: var(--mb-color-brand-light);
    border: none;
    outline: none;
  }

  .ace_completion-highlight {
    color: var(--mb-color-brand);
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
  .${QueryBuilderS.GuiBuilderData} {
    border-right: none;
  }
`;
