import type { CompletionSource } from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";

import { isRequestText } from "../request-text";

/** Whether the text in the editor can be sent to the AI as a request. */
export type TextRequestOption = {
  /** False when the editor is not for a new column, or is read-only. */
  isEnabled: () => boolean;
};

function isOnTextRequest(
  state: EditorState,
  textRequest: TextRequestOption | undefined,
) {
  return (
    textRequest != null &&
    textRequest.isEnabled() &&
    isRequestText(state.doc.toString())
  );
}

/**
 * No suggestions show while the text reads like a request, which Enter sends
 * to the AI.
 */
export function quietOnTextRequest(textRequest: TextRequestOption | undefined) {
  return function (source: CompletionSource | null): CompletionSource | null {
    if (source === null || textRequest == null) {
      return source;
    }
    return (context) =>
      isOnTextRequest(context.state, textRequest) ? null : source(context);
  };
}
