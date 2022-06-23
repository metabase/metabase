import React, {
  ChangeEvent,
  KeyboardEvent,
  forwardRef,
  HTMLAttributes,
  Ref,
  useCallback,
  useState,
} from "react";
import {
  EditableTextArea,
  EditableTextContent,
  EditableTextRoot,
} from "./EditableText.styled";

export type EditableTextAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface EditableTextProps extends EditableTextAttributes {
  value?: string | null;
  placeholder?: string;
  isMultiline?: boolean;
  onChange?: (value: string) => void;
}

const EditableText = forwardRef(function EditableText(
  {
    value,
    placeholder,
    isMultiline = false,
    onChange,
    ...props
  }: EditableTextProps,
  ref: Ref<HTMLDivElement>,
) {
  const valueText = value ?? "";
  const [inputText, setInputText] = useState(valueText);
  const [isFocused, setIsFocused] = useState(false);
  const displayText = isFocused ? inputText : valueText;

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setInputText(valueText);
  }, [valueText]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);

    if (inputText !== valueText) {
      onChange?.(inputText);
    }
  }, [valueText, inputText, onChange]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setInputText(event.currentTarget.value);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        setInputText(valueText);
      } else if (event.key === "Enter" && !isMultiline) {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
    [valueText, isMultiline],
  );

  return (
    <EditableTextRoot ref={ref} {...props}>
      <EditableTextContent>{displayText}&nbsp;</EditableTextContent>
      <EditableTextArea
        value={displayText}
        placeholder={placeholder}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
    </EditableTextRoot>
  );
});

export default EditableText;
