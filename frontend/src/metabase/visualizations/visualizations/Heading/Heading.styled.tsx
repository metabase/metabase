import { css } from "@emotion/react";
import styled from "@emotion/styled";

import DashboardS from "metabase/css/dashboard.module.css";
import { color } from "metabase/lib/colors";

interface InputContainerProps {
  isPreviewing: boolean;
  isEmpty: boolean;
}

export const InputContainer = styled.div<InputContainerProps>`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding-left: 0.75rem;
  pointer-events: auto;
  border-radius: 8px;

  &:hover {
    /* adjust for border on hover */
    padding-left: calc(0.75rem - 1px);
  }

  .${DashboardS.DashCard}:hover &,
  .${DashboardS.DashCard}:focus-within & {
    border: 1px solid ${color("brand")};
  }

  .${DashboardS.DashCard}.resizing & {
    border: 1px solid ${color("brand")};
  }

  ${({ isPreviewing, isEmpty }) =>
    (!isPreviewing || isEmpty) &&
    css`
      padding-left: calc(0.75rem - 1px);
    `} /* adjust for border on preview/no entered content */
  ${({ isEmpty }) =>
    isEmpty &&
    css`
      border: 1px solid ${color("brand")};
      color: ${color("text-light")};
    `}
`;

export const TextInput = styled.input`
  border: none;
  background: none;
  max-height: 100%;
  color: ${color("text-dark")};
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

export const HeadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding-left: 0.75rem;
  width: 100%;
`;

interface HeadingContentProps {
  isEditing?: boolean;
}

export const HeadingContent = styled.h2<HeadingContentProps>`
  max-height: 100%;
  max-width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  font-size: 1.375rem;
  padding: 0;
  margin: 0.25rem 0;
  pointer-events: all;

  ${({ isEditing }) =>
    isEditing &&
    css`
      cursor: text;
    `}
`;
