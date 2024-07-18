import {
  forwardRef,
  useEffect,
  useRef,
  type MouseEvent,
  type Ref,
} from "react";

import Markdown from "metabase/core/components/Markdown";

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
    isMarkdown = false,
    onChange,
    onFocus,
    onBlur,
    "data-testid": dataTestId,
    ...props
  }: EditableTextProps,
  ref: Ref<HTMLDivElement>,
) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    inputValue,
    isInFocus,
    setIsInFocus,
    handleChange,
    handleBlur,
    handleKeyDown,
  } = useEditableText({
    initialValue,
    isOptional,
    isMultiline,
    onChange,
    onBlur,
  });

  const displayValue = inputValue ? inputValue : placeholder;

  useEffect(() => {
    if (!isMarkdown) {
      return;
    }

    if (isInFocus) {
      inputRef.current?.focus();
    }
  }, [isInFocus, isMarkdown]);

  const handleRootElementClick = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLAnchorElement)) {
      setIsInFocus(true);
    }
  };

  const shouldShowMarkdown = isMarkdown && !isInFocus && inputValue;

  return (
    <EditableTextRoot
      onClick={isMarkdown ? handleRootElementClick : undefined}
      {...props}
      ref={ref}
      isDisabled={isDisabled}
      isEditingMarkdown={!shouldShowMarkdown}
      data-value={`${displayValue}\u00A0`}
      data-testid="editable-text"
    >
      {shouldShowMarkdown ? (
        <Markdown>{inputValue}</Markdown>
      ) : (
        <EditableTextArea
          ref={inputRef}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(EditableText, { Root: EditableTextRoot });
