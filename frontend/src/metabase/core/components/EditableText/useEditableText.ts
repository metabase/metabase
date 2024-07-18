import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEventHandler,
  type KeyboardEvent,
  type FocusEvent,
  useCallback,
} from "react";
import { usePrevious } from "react-use";

type UseEditableTextOptions = {
  initialValue?: string | null;
  isEditing?: boolean;
  isOptional?: boolean;
  isMultiline?: boolean;
  onChange?: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
};

export function useEditableText({
  initialValue,
  isEditing = false,
  isOptional = false,
  isMultiline = false,
  onChange,
  onBlur,
}: UseEditableTextOptions) {
  const [inputValue, setInputValue] = useState(initialValue ?? "");
  const [submitValue, setSubmitValue] = useState(initialValue ?? "");
  const [isInFocus, setIsInFocus] = useState(isEditing);
  const submitOnBlur = useRef(true);
  const previousInitialValue = usePrevious(initialValue);

  useEffect(() => {
    if (initialValue && initialValue !== previousInitialValue) {
      setInputValue(initialValue);
    }
  }, [initialValue, previousInitialValue]);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>) => {
      setIsInFocus(false);

      if (!isOptional && !inputValue) {
        setInputValue(submitValue);
      } else if (inputValue !== submitValue && submitOnBlur.current) {
        setSubmitValue(inputValue);
        onChange?.(inputValue);
      }

      onBlur?.(event);
    },
    [inputValue, submitValue, isOptional, onChange, onBlur, setIsInFocus],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(event.currentTarget.value);
      submitOnBlur.current = true;
    },
    [submitOnBlur],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        setInputValue(submitValue);
        submitOnBlur.current = false;
        event.currentTarget.blur();
      } else if (event.key === "Enter" && !isMultiline) {
        event.preventDefault();
        submitOnBlur.current = true;
        event.currentTarget.blur();
      }
    },
    [submitValue, isMultiline],
  );

  return {
    inputValue,
    isInFocus,
    setIsInFocus,
    handleChange,
    handleBlur,
    handleKeyDown,
  };
}
