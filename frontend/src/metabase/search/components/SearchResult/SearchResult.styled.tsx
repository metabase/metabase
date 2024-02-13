import isPropValid from "@emotion/is-prop-valid";
import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { AnchorHTMLAttributes, HTMLAttributes, RefObject } from "react";
import { PLUGIN_MODERATION } from "metabase/plugins";
import type { AnchorProps, BoxProps, ButtonProps } from "metabase/ui";
import { Box, Divider, Stack, Anchor, Button } from "metabase/ui";
import Markdown from "metabase/core/components/Markdown";

const { ModerationStatusIcon } = PLUGIN_MODERATION;

const isBoxPropValid = (propName: PropertyKey) => {
  return (
    propName !== "isActive" &&
    propName !== "isSelected" &&
    isPropValid(propName)
  );
};

export const ResultTitle = styled(Anchor)<
  AnchorProps & AnchorHTMLAttributes<HTMLAnchorElement>
>`
  line-height: unset;
  font-weight: 700;
  font-size: ${({ theme }) => theme.fontSizes.md};

  color: ${({ theme }) => theme.colors.text[2]};

  &:hover,
  &:focus-visible,
  &:focus {
    text-decoration: none;
    color: ${({ theme }) => theme.colors.brand[1]};
    outline: 0;
  }
`;

export const SearchResultContainer = styled(Box, {
  shouldForwardProp: isBoxPropValid,
})<
  BoxProps &
    HTMLAttributes<HTMLButtonElement> & {
      isActive?: boolean;
      isSelected?: boolean;
      component?: string;
      ref?: RefObject<HTMLButtonElement> | null;
    }
>`
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  justify-content: center;
  align-items: center;
  gap: 0.5rem 0.75rem;

  padding: ${({ theme }) => theme.spacing.sm};

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

      &:focus-within {
        background-color: ${theme.colors.brand[0]};
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
  grid-row: 1 / span 1;
  grid-column: 3;
`;

export const XRaySection = styled(Box)<BoxProps>`
  grid-row: 1 / span 1;
  grid-column: 4;
`;

export const XRayButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>`
  width: 2rem;
  height: 2rem;
`;

export const DescriptionSection = styled(Box)`
  grid-column-start: 2;
`;

export const DescriptionDivider = styled(Divider)`
  border-radius: ${({ theme }) => theme.radius.xs};
`;

export const SearchResultDescription = styled(Markdown)`
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
  white-space: pre-line;
  font-size: 0.75rem;
`;
