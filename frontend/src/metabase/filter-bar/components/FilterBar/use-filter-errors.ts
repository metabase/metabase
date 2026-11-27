import type { Editor } from "@tiptap/core";
import { useCallback, useRef, useState } from "react";

import { clearErrors, highlightErrors, normalizeDocument } from "../../editor";
import type { ParseError } from "../../model";

export const useFilterErrors = <F>() => {
  const [error, setError] = useState<ParseError | null>(null);
  const isValidatingRef = useRef(false);

  const showError = useCallback((editor: Editor) => {
    if (isValidatingRef.current) {
      setError(highlightErrors(editor));
    } else {
      clearErrors(editor);
      setError(null);
    }
  }, []);

  const settleErrors = useCallback(
    (editor: Editor) => {
      isValidatingRef.current = true;
      normalizeDocument<F>(editor);
      showError(editor);
    },
    [showError],
  );

  const resetErrors = useCallback(
    (editor: Editor) => {
      isValidatingRef.current = false;
      showError(editor);
    },
    [showError],
  );

  return { error, showError, settleErrors, resetErrors };
};
