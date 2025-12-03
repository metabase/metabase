import {
  CompletionContext,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";

export function complete(source: CompletionSource | null, doc: string) {
  if (!source) {
    return null;
  }

  const cur = doc.indexOf("|");
  if (cur === -1) {
    throw new Error("Please use | to indicate the position of the cursor");
  }

  doc = doc.slice(0, cur) + doc.slice(cur + 1);

  const state = EditorState.create({
    doc,
    selection: { anchor: cur },
  });

  const ctx = new CompletionContext(state, cur, false);
  return source(ctx);
}
