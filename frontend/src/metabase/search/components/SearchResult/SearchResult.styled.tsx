import isPropValid from "@emotion/is-prop-valid";
// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  PropsWithChildren,
  RefObject,
} from "react";

import Markdown from "metabase/common/components/Markdown";
import type { AnchorProps, BoxProps, ButtonProps } from "metabase/ui";
import { Anchor, Box, Button, Divider, Stack } from "metabase/ui";

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
  color: var(--mb-color-text-primary);

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
      background-color: ${isSelected && "var(--mb-color-background-hover)"};

      ${ResultTitle} {
        color: ${isSelected && "var(--mb-color-brand)"};
      }

      &:hover {
        background-color: var(--mb-color-background-hover);
        cursor: pointer;

        ${ResultTitle} {
          color: var(--mb-color-brand);
        }
      }

      &:focus-within {
        background-color: var(--mb-color-background-hover);
      }
    `}
`;

export const ResultNameSection = styled(Stack)`
  overflow: hidden;
`;

export const LoadingSection = styled(Box)<BoxProps>`
  grid-row: 1 / span 1;
  grid-column: 3;
` as unknown as typeof Box;

export const XRaySection = styled(Box)<BoxProps>`
  grid-row: 1 / span 1;
  grid-column: 4;
` as unknown as typeof Box;

export const XRayButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>`
  width: 2rem;
  height: 2rem;
`;

export const DescriptionSection = styled(Box)<PropsWithChildren>`
  margin-top: 0.5rem;
` as unknown as typeof Box;

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
