import type { EditorView } from "@codemirror/view";
import { useCallback, useState } from "react";
import { useLatest } from "react-use";

import type { FormulaEditorProps } from "./types";

type Options = Pick<FormulaEditorProps, "initialSource" | "onEditorCreate"> & {
  onChange: () => void;
};

export function useFormulaSource({
  initialSource = "",
  onEditorCreate,
  onChange,
}: Options) {
  const [source, setSource] = useState(initialSource);
  const sourceRef = useLatest(source);
  const callbacks = useLatest({ onChange, onEditorCreate });

  const handleChange = useCallback(
    (value: string) => {
      if (value === sourceRef.current) {
        return;
      }
      setSource(value);
      callbacks.current.onChange();
    },
    [sourceRef, callbacks],
  );

  const handleCreate = useCallback(
    (view: EditorView) => {
      view.focus();
      callbacks.current.onEditorCreate?.(view);
    },
    [callbacks],
  );

  return { source, handleChange, handleCreate };
}
