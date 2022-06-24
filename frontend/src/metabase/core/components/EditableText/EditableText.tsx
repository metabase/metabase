import React, {
  ChangeEvent,
  KeyboardEvent,
  forwardRef,
  HTMLAttributes,
  Ref,
  useCallback,
  useState,
  useLayoutEffect,
} from "react";
import { EditableTextArea, EditableTextRoot } from "./EditableText.styled";

export type EditableTextAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface EditableTextProps extends EditableTextAttributes {
  value?: string | null;
  placeholder?: string;
  isOptional?: boolean;
  isMultiline?: boolean;
  onChange?: (value: string) => void;
  "data-testid"?: string;
}

const EditableText = forwardRef(function EditableText(
  {
    value,
    placeholder,
    isOptional = false,
    isMultiline = false,
    onChange,
    "data-testid": dataTestId,
    ...props
  }: EditableTextProps,
  ref: Ref<HTMLDivElement>,
) {
  const valueText = value ?? "";
  const [inputText, setInputText] = useState(valueText);
  const displayText = inputText ? inputText : placeholder;

  const handleBlur = useCallback(() => {
    if (!isOptional && !inputText) {
      setInputText(valueText);
    } else if (inputText !== valueText) {
      onChange?.(inputText);
    }
  }, [inputText, valueText, isOptional, onChange]);

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

  useLayoutEffect(() => {
    setInputText(valueText);
  }, [valueText]);

  return (
    <EditableTextRoot {...props} ref={ref} data-value={`${displayText}\u00A0`}>
      <EditableTextArea
        value={inputText}
        placeholder={placeholder}
        data-testid={dataTestId}
        onBlur={handleBlur}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
    </EditableTextRoot>
  );
});

export default EditableText;
