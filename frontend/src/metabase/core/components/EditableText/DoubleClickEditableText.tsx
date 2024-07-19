import {
  forwardRef,
  useEffect,
  useRef,
  type MouseEvent,
  type Ref,
} from "react";

import { EditableTextArea, EditableTextRoot } from "./EditableText.styled";
import type { EditableTextProps } from "./types";
import { useEditableText } from "./useEditableText";

export const DoubleClickEditableText = forwardRef(
  function DoubleClickEditableText(
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

    useEffect(() => {
      if (isInFocus) {
        inputRef.current?.focus();
      }
    }, [isInFocus]);

    const handleRootElementDoubleClick = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLAnchorElement)) {
        setIsInFocus(true);
      }
    };

    const displayValue = inputValue ? inputValue : placeholder;

    return (
      <EditableTextRoot
        {...props}
        isDisabled={isDisabled}
        isInFocus={Boolean(!isInFocus && inputValue)}
        onDoubleClick={handleRootElementDoubleClick}
        hasHoverBorder={false}
        data-value={`${displayValue}\u00A0`}
        data-testid="editable-text"
        ref={ref}
      >
        {isInFocus && inputValue ? (
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
        ) : (
          <span data-testid={dataTestId}>{displayValue}</span>
        )}
      </EditableTextRoot>
    );
  },
);
