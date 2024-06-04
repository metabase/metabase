import isPropValid from "@emotion/is-prop-valid";
import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  RefObject,
  PropsWithChildren,
} from "react";

import Markdown from "metabase/core/components/Markdown";
import { PLUGIN_MODERATION } from "metabase/plugins";
import type { AnchorProps, BoxProps, ButtonProps } from "metabase/ui";
import { Box, Divider, Stack, Anchor, Button } from "metabase/ui";

const isBoxPropValid = (propName: string) => {
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

  color: ${({ theme }) => theme.fn.themeColor("text-dark")};

  &:hover,
  &:focus-visible,
  &:focus {
    text-decoration: none;
    color: var(--mb-color-brand);
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
  align-items: start;
  gap: 0.5rem 0.75rem;

  padding: ${({ theme }) => theme.spacing.sm};

  ${({ theme, isActive, isSelected }) =>
    isActive &&
    css`
      border-radius: ${theme.radius.md};
      color: ${isSelected && "var(--mb-color-brand)"};
      background-color: ${isSelected && "var(--mb-color-brand-lighter)"};

      ${ResultTitle} {
        color: ${isSelected && "var(--mb-color-brand)"};
      }

      &:hover {
        background-color: var(--mb-color-brand-lighter);
        cursor: pointer;

        ${ResultTitle} {
          color: var(--mb-color-brand);
        }
      }

      &:focus-within {
        background-color: var(--mb-color-brand-lighter);
      }
    `}
`;

export const ResultNameSection = styled(Stack)`
  overflow: hidden;
`;

export const ModerationIcon = styled(PLUGIN_MODERATION.ModerationStatusIcon)`
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

export const DescriptionSection = styled(Box)<PropsWithChildren>`
  margin-top: 0.5rem;
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
