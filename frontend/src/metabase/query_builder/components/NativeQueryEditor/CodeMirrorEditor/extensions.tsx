import { EditorView, drawSelection } from "@codemirror/view";
import type { Extension } from "@uiw/react-codemirror";
import { getNonce } from "get-nonce";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { monospaceFontFamily } from "metabase/styled-components/theme";

export function useExtensions(): Extension[] {
  return useMemo(() => {
    return [
      nonce(),
      fonts(),
      drawSelection({
        cursorBlinkRate: 1000,
        drawRangeCursor: false,
      }),
    ].filter(isNotNull);
  }, []);
}

function nonce() {
  // CodeMirror injects css into the DOM,
  // to make this work, it needs the have the correct CSP nonce.
  const nonce = getNonce();
  if (!nonce) {
    return null;
  }
  return EditorView.cspNonce.of(nonce);
}

function fonts() {
  return EditorView.theme({
    "&": {
      fontSize: "12px",
      fontFamily: monospaceFontFamily,
    },
  });
}
