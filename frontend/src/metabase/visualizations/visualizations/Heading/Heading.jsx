/* eslint-disable react/prop-types */
// ! REMOVE ABOVE COMMENT AND CONVERT TO TYPESCRIPT
import React, { useState } from "react";

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
}) {
  const [isFocused, setIsFocused] = useState(false);
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
            onChange={e => handleTextChange(e.target.value)}
            // Prevents text cards from dragging when you actually want to select text
            // See: https://github.com/metabase/metabase/issues/17039
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
