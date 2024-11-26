import { EditorView, drawSelection } from "@codemirror/view";
import type { Extension } from "@uiw/react-codemirror";
import { getNonce } from "get-nonce";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";

import type { Location } from "../types";

export function useExtensions(): Extension[] {
  return useMemo(() => {
    return [
      nonce(),
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

export function convertIndexToPosition(value: string, index: number): Location {
  let row = 0;
  let column = 0;

  for (let idx = 0; idx < index; idx++) {
    const ch = value[idx];
    if (ch === "\n") {
      row += 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return {
    row,
    column,
  };
}
