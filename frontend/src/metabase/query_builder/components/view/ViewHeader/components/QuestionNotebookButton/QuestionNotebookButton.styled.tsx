import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { ButtonHTMLAttributes } from "react";

import { ActionIcon, type ActionIconProps } from "metabase/ui";

export const QuestionNotebookActionIcon = styled(ActionIcon)<
  {
    isShowingNotebook?: boolean;
  } & ActionIconProps &
    ButtonHTMLAttributes<HTMLButtonElement>
>`
  ${({ theme, isShowingNotebook }) => {
    return (
      !isShowingNotebook &&
      css`
        color: ${theme.fn.themeColor("text-dark")};
        background-color: transparent;
        border: 1px solid transparent;
        transition: background 300ms linear, border 300ms linear;
        &:hover {
          color: ${theme.fn.themeColor("brand")};
          background-color: ${theme.fn.themeColor("bg-medium")};
          border: 1px solid transparent;
        }
      `
    );
  }}
`;
