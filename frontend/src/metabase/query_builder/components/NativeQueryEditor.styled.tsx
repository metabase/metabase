import styled from "@emotion/styled";

export const NativeQueryEditorRoot = styled.div`
  .ace_editor {
    height: 100%;
    background-color: var(--color-bg-light);
    color: var(--color-text-dark);
  }

  .ace_editor .ace_keyword {
    color: var(--color-saturated-purple);
  }

  .ace_editor .ace_function,
  .ace_editor .ace_variable {
    color: var(--color-saturated-blue);
  }

  .ace_editor .ace_constant,
  .ace_editor .ace_type {
    color: var(--color-saturated-red);
  }

  .ace_editor .ace_string {
    color: var(--color-saturated-green);
  }

  .ace_editor .ace_templateTag {
    color: var(--color-brand);
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
    color: var(--color-text-light);
    padding-left: 0;
    padding-right: 7px;
    display: block;
    text-align: center;
  }

  .NativeQueryEditor .ace_editor .ace_gutter {
    background-color: var(--color-bg-light);
  }
`;
