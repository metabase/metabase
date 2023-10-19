import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes, RefObject } from "react";
import { PLUGIN_MODERATION } from "metabase/plugins";
import type { BoxProps, TitleProps } from "metabase/ui";
import { Box, Divider, Stack, Title as MantineTitle } from "metabase/ui";

const { ModerationStatusIcon } = PLUGIN_MODERATION;

export const ResultTitle = styled(MantineTitle)<TitleProps>``;

export const SearchResultContainer = styled(Box)<
  BoxProps &
    HTMLAttributes<HTMLButtonElement> & {
      isActive?: boolean;
      isSelected?: boolean;
      component?: string;
      ref?: RefObject<HTMLButtonElement> | null;
    }
>`
  display: grid;
  grid-template-columns: auto 1fr auto;
  justify-content: center;
  align-items: center;
  gap: 0.5rem 0.75rem;

  ${({ theme, isActive, isSelected }) =>
    isActive &&
    css`
      border-radius: ${theme.radius.md};
      color: ${isSelected && theme.colors.brand[1]};
      background-color: ${isSelected && theme.colors.brand[0]};

      ${ResultTitle} {
        color: ${isSelected && theme.colors.brand[1]};
      }

      &:hover {
        background-color: ${theme.colors.brand[0]};
        cursor: pointer;

        ${ResultTitle} {
          color: ${theme.colors.brand[1]};
        }
      }
    `}
`;

export const ResultNameSection = styled(Stack)`
  overflow: hidden;
`;

export const ModerationIcon = styled(ModerationStatusIcon)`
  overflow: unset;
`;

export const LoadingSection = styled(Box)<BoxProps>`
  grid-row: 1 / span 2;
  grid-column: 3;
`;

export const DescriptionSection = styled(Box)`
  grid-column-start: 2;
`;

export const DescriptionDivider = styled(Divider)`
  border-radius: ${({ theme }) => theme.radius.xs};
`;
