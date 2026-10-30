import debounce from "lodash.debounce";
import { useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";

const CHANGE_DEBOUNCE_MS = 400;

/**
 * Local text state for a free-text setting widget. Edits reach `onChange`
 * debounced, and blur commits a pending edit at once. A new `value` from the
 * outside replaces the text.
 */
export function useDebouncedSettingText(
  value: string | undefined,
  onChange: (text: string) => void,
) {
  const [text, setText] = useState(value ?? "");

  useEffect(() => {
    setText(value ?? "");
  }, [value]);

  const onChangeRef = useLatest(onChange);
  const onChangeDebounced = useMemo(
    () =>
      debounce(
        (newText: string) => onChangeRef.current(newText),
        CHANGE_DEBOUNCE_MS,
      ),
    [onChangeRef],
  );

  const handleChange = (newText: string) => {
    setText(newText);
    onChangeDebounced(newText);
  };

  const handleBlur = () => {
    if (text !== (value ?? "")) {
      onChangeDebounced.cancel();
      onChangeRef.current(text);
    }
  };

  return { text, handleChange, handleBlur };
}
