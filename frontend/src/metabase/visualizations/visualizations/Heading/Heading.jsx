/* eslint-disable react/prop-types */
// ! REMOVE ABOVE COMMENT AND CONVERT TO TYPESCRIPT
import React, { useState, useMemo } from "react";

import cx from "classnames";
import { t } from "ttag";

import {
  InputContainer,
  HeadingContent,
  HeadingContainer,
  TextInput,
} from "./Heading.styled";

export function Heading({
  settings,
  isEditing,
  onUpdateVisualizationSettings,
  dashcard,
}) {
  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);

  const [isFocused, setIsFocused] = useState(justAdded);
  const [isHovering, setIsHovering] = useState(false);
  const isPreviewing = !isFocused && !isHovering;

  const handleTextChange = text =>
    onUpdateVisualizationSettings({ text: text });
  const preventDragging = e => e.stopPropagation();

  const content = settings.text;

  // ! REMOVE ANY CLASSNAME STYLING IF POSSIBLE
  if (isEditing) {
    return (
      <InputContainer
        isPreviewing={isPreviewing}
        isFocused={isFocused}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {isPreviewing ? (
          <HeadingContent>{content}</HeadingContent>
        ) : (
          <TextInput
            className={cx("full flex-full flex flex-column bg-light bordered")}
            name="heading"
            placeholder={t`Heading`}
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
