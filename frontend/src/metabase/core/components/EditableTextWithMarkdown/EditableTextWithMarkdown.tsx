import React, { useState, useRef, useEffect, MouseEvent } from "react";
import EditableText, {
  TextareaComponentRef,
  EditableTextProps,
} from "../EditableText";
import {
  EditableTextWithMarkdownRoot,
  Markdown,
} from "./EditableTextWithMarkdown.styled";

type EditableTextWithMarkdownProps = EditableTextProps;

const EditableTextWithMarkdown = ({
  onFocus,
  onBlur,
  onChange,
  isEditing,
  initialValue,
  ...rest
}: EditableTextWithMarkdownProps) => {
  const [isInFocus, setIsInFocus] = useState(isEditing);
  const [inputValue, setInputValue] = useState(initialValue ?? "");
  const input = useRef<TextareaComponentRef>(null);

  useEffect(() => {
    if (isInFocus) {
      input.current?.focusInput();
    }
  }, [isInFocus]);

  const handleBlur = () => {
    setIsInFocus(false);
    onBlur?.();
  };

  const handleFocus = () => {
    setIsInFocus(true);
    onFocus?.();
  };

  const handleChange = (inputValue: string) => {
    setInputValue(inputValue);
    onChange?.(inputValue);
  };

  const handleRootElementClick = (event: MouseEvent) => {
    if ((event.target as HTMLElement).tagName.toLowerCase() !== "a") {
      setIsInFocus(true);
    }
  };

  return (
    <EditableTextWithMarkdownRoot
      data-testid="textarea-with-markdown"
      onClick={handleRootElementClick}
    >
      <EditableText
        initialValue={inputValue}
        isMultiline
        ref={input}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        isEditing={isEditing}
        // eslint-disable-next-line react/no-children-prop
        children={
          isInFocus || !inputValue ? undefined : (
            <Markdown disallowHeading>{inputValue}</Markdown>
          )
        }
        {...rest}
      />
    </EditableTextWithMarkdownRoot>
  );
};

export default EditableTextWithMarkdown;
