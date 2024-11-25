import { EditorView } from "@codemirror/view";
import type { Extension } from "@uiw/react-codemirror";
import { getNonce } from "get-nonce";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";

export function useExtensions(): Extension[] {
  return useMemo(() => {
    return [nonceExtension()].filter(isNotNull);
  }, []);
}

function nonceExtension() {
  // CodeMirror injects css into the DOM,
  // to make this work, it needs the have the correct CSP nonce.
  const nonce = getNonce();
  if (!nonce) {
    return null;
  }
  return EditorView.cspNonce.of(nonce);
}
