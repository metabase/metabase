import React, { useState, useMemo, MouseEvent } from "react";

import cx from "classnames";
import { t } from "ttag";

import {
  InputContainer,
  HeadingContent,
  HeadingContainer,
  TextInput,
} from "./Heading.styled";

interface HeadingProps {
  isEditing: boolean;
  onUpdateVisualizationSettings: ({ text }: { text: string }) => void;
  dashcard: { justAdded?: boolean };
  settings: { text: string };
}

export function Heading({
  settings,
  isEditing,
  onUpdateVisualizationSettings,
  dashcard,
}: HeadingProps) {
  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);

  const [isFocused, setIsFocused] = useState(justAdded);
  const [isHovering, setIsHovering] = useState(false);
  const isPreviewing = !isFocused && !isHovering;

  const handleTextChange = (text: string) =>
    onUpdateVisualizationSettings({ text });
  const preventDragging = (e: MouseEvent<HTMLInputElement>) =>
    e.stopPropagation();

  const content = settings.text;
  const hasNoContent = !content;
  const placeholder = t`Heading`;

  if (isEditing) {
    return (
      <InputContainer
        className={cx("text-edit-container", {
          "has-no-content": hasNoContent,
        })}
        isPreviewing={isPreviewing}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {isPreviewing ? (
          <HeadingContent hasNoContent={hasNoContent}>
            {content || placeholder}
          </HeadingContent>
        ) : (
          <TextInput
            name="heading"
            placeholder={placeholder}
            value={content}
            autoFocus={justAdded}
            onChange={e => handleTextChange(e.target.value)}
            onMouseDown={preventDragging}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
        )}
      </InputContainer>
    );
  }

  return (
    <HeadingContainer>
      <HeadingContent>{content}</HeadingContent>
    </HeadingContainer>
  );
}
