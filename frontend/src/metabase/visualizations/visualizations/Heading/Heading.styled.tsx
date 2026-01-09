// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import DashboardS from "metabase/css/dashboard.module.css";

interface InputContainerProps {
  isPreviewing: boolean;
  isEmpty: boolean;
}

// TODO move this to CSS module
export const InputContainer = styled.div<InputContainerProps>`
  display: flex;
  width: 100%;
  height: 100%;
  justify-content: space-between;
  align-items: center;
  overflow: hidden;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  pointer-events: auto;
  border-radius: 8px;
  border: 1px solid transparent;

  * {
    pointer-events: auto;
  }

  .${DashboardS.DashCard}:hover &,
  .${DashboardS.DashCard}:focus-within & {
    border: 1px solid var(--mb-color-brand);
  }

  .${DashboardS.DashCard}.resizing & {
    border-color: var(--mb-color-brand);
  }

  ${({ isPreviewing, isEmpty }) =>
    (!isPreviewing || isEmpty) &&
    css`
      padding-left: calc(0.75rem - 1px);
    `} /* adjust for border on preview/no entered content */
  ${({ isEmpty }) =>
    isEmpty &&
    css`
      border: 1px solid var(--mb-color-brand);
      color: var(--mb-color-text-tertiary);
    `}
`;

const TextInput = styled.input`
  border: none;
  background: none;
  max-height: 100%;
  color: var(--mb-color-text-primary);
  font-size: 1.375rem;
  font-weight: 700;
  height: inherit;
  min-height: unset;
  outline: none;
  padding: 0;
  margin: 0.25rem 0;
  pointer-events: all;
  resize: none;
  width: 100%;
`;

interface HeadingContentProps {
  isEditing?: boolean;
  hasFilters?: boolean;
}

export const HEADING_FONT_SIZE = "1.375rem";
export const HEADING_FONT_WEIGHT = 700;

export const HeadingContent = styled.h2<HeadingContentProps>`
  flex: 1;
  max-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  font-size: ${HEADING_FONT_SIZE};
  font-weight: ${HEADING_FONT_WEIGHT};
  padding: 0;
  margin: 0.25rem 0;
  pointer-events: all;

  ${({ isEditing }) =>
    isEditing &&
    css`
      cursor: text;
    `}

  ${({ hasFilters }) =>
    hasFilters &&
    css`
      white-space: nowrap;
      text-overflow: ellipsis;
    `}
`;

export const HeadingTextInput = styled(TextInput)`
  flex: 1;
  text-overflow: ellipsis;
`;
