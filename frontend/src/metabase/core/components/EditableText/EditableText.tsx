import React, {
  ChangeEvent,
  KeyboardEvent,
  forwardRef,
  HTMLAttributes,
  Ref,
  useCallback,
  useEffect,
  useState,
  useRef,
  MouseEvent,
} from "react";

import { usePrevious } from "react-use";

import {
  EditableTextArea,
  EditableTextRoot,
  Markdown,
} from "./EditableText.styled";

export type EditableTextAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface EditableTextProps extends EditableTextAttributes {
  initialValue?: string | null;
  placeholder?: string;
  isEditing?: boolean;
  isOptional?: boolean;
  isMultiline?: boolean;
  isDisabled?: boolean;
  isMarkdown?: boolean;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  "data-testid"?: string;
}

const EditableText = forwardRef(function EditableText(
  {
    initialValue,
    placeholder,
    isEditing = false,
    isOptional = false,
    isMultiline = false,
    isDisabled = false,
    isMarkdown = false,
    onChange,
    onFocus,
    onBlur,
    "data-testid": dataTestId,
    ...props
  }: EditableTextProps,
  ref: Ref<HTMLDivElement>,
) {
  const [inputValue, setInputValue] = useState(initialValue ?? "");
  const [submitValue, setSubmitValue] = useState(initialValue ?? "");
  const [isInFocus, setIsInFocus] = useState(isEditing);
  const displayValue = inputValue ? inputValue : placeholder;
  const submitOnBlur = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const previousInitialValue = usePrevious(initialValue);

  useEffect(() => {
    if (initialValue && initialValue !== previousInitialValue) {
      setInputValue(initialValue);
    }
  }, [initialValue, previousInitialValue]);

  useEffect(() => {
    if (isMarkdown && isInFocus) {
      input.current?.focus();
    }
  }, [isInFocus, isMarkdown]);

  const handleBlur = useCallback(
    e => {
      if (isMarkdown) {
        setIsInFocus(false);
      }

      if (!isOptional && !inputValue) {
        setInputValue(submitValue);
      } else if (inputValue !== submitValue && submitOnBlur.current) {
        setSubmitValue(inputValue);
        onChange?.(inputValue);
      }

      onBlur?.();
    },
    [
      inputValue,
      submitValue,
      isOptional,
      isMarkdown,
      onChange,
      onBlur,
      setIsInFocus,
    ],
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

  const handleRootElementClick = (event: MouseEvent) => {
    if ((event.target as HTMLElement).tagName.toLowerCase() !== "a") {
      setIsInFocus(true);
    }
  };

  const shouldShowMarkdown = isMarkdown && !isInFocus && inputValue;
  const shouldShowInput = !shouldShowMarkdown;

  return (
    <EditableTextRoot
      onClick={isMarkdown ? handleRootElementClick : undefined}
      {...props}
      ref={ref}
      isEditing={isEditing}
      isDisabled={isDisabled}
      data-value={`${displayValue}\u00A0`}
      data-testid="editable-text"
    >
      {shouldShowMarkdown && <Markdown>{inputValue}</Markdown>}
      {shouldShowInput && (
        <EditableTextArea
          ref={input}
          value={inputValue}
          placeholder={placeholder}
          disabled={isDisabled}
          data-testid={dataTestId}
          onFocus={onFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      )}
    </EditableTextRoot>
  );
});

export default Object.assign(EditableText, { Root: EditableTextRoot });
