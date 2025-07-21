// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { Group, Button } from "metabase/ui";

export const EditorContainer = styled.div`
  .ProseMirror {
    outline: none;
    min-height: 400px;
    padding: 40px;
    padding-top: 0;
    border-radius: 8px;
    background-color: white;
    font-family: inherit;
    line-height: 1.6;
  }

  .ProseMirror p {
    margin: 0.5em 0;
  }

  .ProseMirror h1,
  .ProseMirror h2,
  .ProseMirror h3,
  .ProseMirror h4,
  .ProseMirror h5,
  .ProseMirror h6 {
    margin: 1em 0 0.5em 0;
    font-weight: 600;
  }

  .ProseMirror h1 {
    font-size: 2em;
  }

  .ProseMirror h2 {
    font-size: 1.5em;
  }

  .ProseMirror h3 {
    font-size: 1.25em;
  }

  .ProseMirror ul,
  .ProseMirror ol {
    padding-left: 1.5em;
    margin: 0.5em 0;
  }

  .ProseMirror blockquote {
    border-left: 3px solid #e0e0e0;
    margin: 1em 0;
    padding-left: 1em;
    font-style: italic;
    color: #666;
  }

  .ProseMirror hr {
    border: 1px solid #e0e0e0;
    margin: 1em 0;
    border-top: none;
  }

  .ProseMirror code {
    background-color: #f5f5f5;
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.9em;
  }

  .ProseMirror pre {
    background-color: #f5f5f5;
    padding: 1em;
    border-radius: 4px;
    overflow-x: auto;
    margin: 1em 0;
  }

  .ProseMirror pre code {
    background-color: transparent;
    padding: 0;
  }

  .ProseMirror strong {
    font-weight: 600;
  }

  .ProseMirror em {
    font-style: italic;
  }

  .ProseMirror .mention {
    background-color: var(--mb-color-brand);
    color: white;
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-weight: 500;
    text-decoration: none;
    display: inline-block;
    margin: 0 0.1em;
  }

  .ProseMirror .mention:hover {
    background-color: var(--mb-color-brand-hover);
  }

  .ProseMirror .is-editor-empty:first-child::before {
    color: #adb5bd;
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }
`;

export const EditorToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #e0e0e0;
  background-color: #f8f9fa;
  border-radius: 8px 8px 0 0;
`;

export const ToolbarButton = styled.button<{ active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid ${props => props.active ? 'var(--mb-color-brand)' : '#e0e0e0'};
  border-radius: 4px;
  background-color: ${props => props.active ? 'var(--mb-color-brand)' : 'white'};
  color: ${props => props.active ? 'white' : '#333'};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: ${props => props.active ? 'var(--mb-color-brand-hover)' : '#f5f5f5'};
    border-color: ${props => props.active ? 'var(--mb-color-brand-hover)' : '#ccc'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const StyledEditorContent = styled.div`
  border-radius: 0 0 8px 8px;
  overflow: hidden;
`;
