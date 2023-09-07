import styled from "@emotion/styled";
import { css } from "@emotion/react";
import type { HTMLAttributes } from "react";
import type { BoxProps } from "metabase/ui";
import { Box } from "metabase/ui";

export const UserElement = styled(Box)<
  HTMLAttributes<HTMLDivElement> & BoxProps & { isSelected: boolean }
>`
  cursor: pointer;
  border-radius: ${({ theme }) => theme.radius.sm};

  ${({ isSelected, theme }) =>
    isSelected &&
    css`
      background-color: ${theme.colors.brand[0]};
    `}

  &:hover {
    background-color: ${({ theme }) => theme.colors.brand[0]};
  }
`;
