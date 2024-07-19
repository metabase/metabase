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

const _EditableMarkdownText = forwardRef(function EditableMarkdownText(
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

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isInFocus) {
      inputRef.current?.focus();
    }
  }, [isInFocus]);

  const handleRootElementClick = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLAnchorElement)) {
      setIsInFocus(true);
    }
  };

  const displayValue = inputValue ? inputValue : placeholder;
  const shouldShowMarkdown = Boolean(!isInFocus && inputValue);

  return (
    <EditableTextRoot
      {...props}
      isDisabled={isDisabled}
      isInFocus={shouldShowMarkdown}
      onClick={handleRootElementClick}
      data-value={`${displayValue}\u00A0`}
      data-testid="editable-text"
      ref={ref}
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

export const EditableMarkdownText = Object.assign(_EditableMarkdownText, {
  Root: EditableTextRoot,
});
