import React, {
  ChangeEvent,
  KeyboardEvent,
  forwardRef,
  HTMLAttributes,
  Ref,
  useCallback,
  useState,
} from "react";
import { EditableTextArea, EditableTextRoot } from "./EditableText.styled";

export type EditableTextAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface EditableTextProps extends EditableTextAttributes {
  value?: string | null;
  placeholder?: string;
  isMultiline?: boolean;
  onChange?: (value: string) => void;
  "data-testid"?: string;
}

const EditableText = forwardRef(function EditableText(
  {
    value,
    placeholder,
    isMultiline = false,
    onChange,
    "data-testid": dataTestId,
    ...props
  }: EditableTextProps,
  ref: Ref<HTMLDivElement>,
) {
  const valueText = value ?? "";
  const [isFocused, setIsFocused] = useState(false);
  const [inputText, setInputText] = useState(valueText);
  const displayText = isFocused ? inputText : valueText;

  const handleFocus = useCallback(() => {
    setInputText(valueText);
    setIsFocused(true);
  }, [valueText]);

  const handleBlur = useCallback(() => {
    if (inputText !== valueText) {
      onChange?.(inputText);
    }
    setIsFocused(false);
  }, [inputText, valueText, onChange]);

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
    <EditableTextRoot {...props} ref={ref} data-value={`${displayText}\u00A0`}>
      <EditableTextArea
        value={displayText}
        placeholder={placeholder}
        data-testid={dataTestId}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
    </EditableTextRoot>
  );
});

export default EditableText;
