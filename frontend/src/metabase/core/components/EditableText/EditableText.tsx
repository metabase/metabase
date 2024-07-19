import { forwardRef, useRef, type Ref } from "react";

import { EditableTextArea, EditableTextRoot } from "./EditableText.styled";
import type { EditableTextProps } from "./types";
import { useEditableText } from "./useEditableText";

const EditableText = forwardRef(function EditableText(
  {
    initialValue,
    placeholder,
    isOptional = false,
    isMultiline = false,
    isDisabled = false,
    onChange,
    onFocus,
    onBlur,
    "data-testid": dataTestId,
    ...props
  }: EditableTextProps,
  ref: Ref<HTMLDivElement>,
) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { inputValue, isInFocus, handleChange, handleBlur, handleKeyDown } =
    useEditableText({
      initialValue,
      isOptional,
      isMultiline,
      onChange,
      onBlur,
    });

  const displayValue = inputValue ? inputValue : placeholder;

  return (
    <EditableTextRoot
      {...props}
      isDisabled={isDisabled}
      isInFocus={isInFocus}
      data-value={`${displayValue}\u00A0`}
      data-testid="editable-text"
      ref={ref}
    >
      <EditableTextArea
        value={inputValue}
        placeholder={placeholder}
        disabled={isDisabled}
        data-testid={dataTestId}
        onFocus={onFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        ref={inputRef}
      />
    </EditableTextRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(EditableText, { Root: EditableTextRoot });
