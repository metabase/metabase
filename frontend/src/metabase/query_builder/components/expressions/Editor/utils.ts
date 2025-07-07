import {
  hasNextSnippetField,
  hasPrevSnippetField,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";

export function hasActiveSnippet(state: EditorState) {
  return hasNextSnippetField(state) || hasPrevSnippetField(state);
}
