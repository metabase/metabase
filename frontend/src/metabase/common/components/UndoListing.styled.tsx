// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Card } from "metabase/common/components/Card";
import { Link } from "metabase/common/components/Link";
import { alpha } from "metabase/lib/colors";
import type { BoxProps } from "metabase/ui";
import { Box, Icon } from "metabase/ui";

const LIST_H_MARGINS = "var(--mantine-spacing-md)";

export const UndoList = styled.ul`
  position: fixed;
  left: 0;
  bottom: 0;
  margin: ${LIST_H_MARGINS};
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

export const ToastCard = styled(Card)<{
  translateY?: number;
  color?: string;
  noBorder?: boolean;
}>`
  padding: 10px var(--mantine-spacing-md);
  margin-top: var(--mantine-spacing-sm);
  max-width: calc(100vw - 2 * ${LIST_H_MARGINS});
  background-color: var(--mb-color-background-primary-inverse);
  color: var(--mb-color-text-secondary-inverse);
  ${({ noBorder }) =>
    noBorder &&
    css`
      border: none;
      overflow-x: hidden;
    `};
`;

export const CardContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const CardContentSide = styled(Box)<BoxProps>`
  display: flex;
  align-items: center;
  overflow: hidden;
` as unknown as typeof Box;

export const ControlsCardContent = styled(CardContentSide)`
  flex-shrink: 0;
` as unknown as typeof Box;

export const CardIcon = styled(Icon)`
  margin-right: var(--mantine-spacing-sm);
  flex-shrink: 0;
`;

export const DefaultText = styled.span`
  font-weight: 700;
`;

export const UndoButton = styled(Link)`
  font-weight: bold;
  background-color: ${() => alpha("background-primary", 0.1)};
  padding: 4px 12px;
  margin-left: var(--mantine-spacing-sm);
  border-radius: 8px;
  white-space: nowrap; /* Prevents button from truncating message */

  :hover {
    background-color: ${() => alpha("background-primary", 0.3)};
  }
`;

export const DismissIcon = styled(Icon)<{ color?: string }>`
  margin-left: var(--mantine-spacing-md);
  cursor: pointer;

  :hover {
    opacity: 0.7;
  }
`;
