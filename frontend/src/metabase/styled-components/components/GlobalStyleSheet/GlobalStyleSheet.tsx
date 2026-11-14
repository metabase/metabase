import { useInsertionEffect, useRef } from "react";

import { getCspNonce } from "metabase/utils/csp";

type GlobalStyleSheetProps = {
  styles: string;
};

/**
 * Appends a style element to the document head on mount, like Emotion's `Global`.
 * Updates replace its text in place, so it keeps its position in the cascade.
 */
export function GlobalStyleSheet({ styles }: GlobalStyleSheetProps) {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useInsertionEffect(() => {
    const style = document.createElement("style");
    const nonce = getCspNonce();
    if (nonce) {
      style.setAttribute("nonce", nonce);
    }
    style.setAttribute("data-global-style-sheet", "");
    document.head.appendChild(style);
    styleRef.current = style;

    return () => {
      style.remove();
      styleRef.current = null;
    };
  }, []);

  useInsertionEffect(() => {
    if (styleRef.current) {
      styleRef.current.textContent = styles;
    }
  }, [styles]);

  return null;
}
