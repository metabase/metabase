// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Link } from "metabase/common/components/Link";
import type { BoxProps } from "metabase/ui";
import { Box, Icon } from "metabase/ui";
import { alpha } from "metabase/ui/colors";

export const UndoList = styled.ul`
  position: fixed;
  inset-inline-start: 0;
  bottom: 0;
  margin: var(--mantine-spacing-lg);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

export const CardContent = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
`;

// Unjustified type cast. FIXME
export const CardContentSide = styled(Box)<BoxProps>`
  display: flex;
  align-items: flex-start;
  overflow: hidden;
` as unknown as typeof Box;

// Unjustified type cast. FIXME
export const ControlsCardContent = styled(CardContentSide)`
  align-items: center;
  flex-shrink: 0;
` as unknown as typeof Box;

export const CardIcon = styled(Icon)`
  position: relative;
  top: 1px;
  margin-inline-end: var(--mantine-spacing-sm);
  flex-shrink: 0;
`;

export const DefaultText = styled.span`
  font-weight: 700;
`;

export const UndoButton = styled(Link)`
  font-weight: bold;
  background-color: ${() => alpha("background_page-primary", 0.1)};
  padding: 4px 12px;
  margin-inline-start: var(--mantine-spacing-sm);
  border-radius: 8px;
  white-space: nowrap; /* Prevents button from truncating message */

  :hover {
    background-color: ${() => alpha("background_page-primary", 0.3)};
  }
`;

export const DismissIcon = styled(Icon)<{ color?: string }>`
  position: relative;
  top: 1px;
  margin-inline-start: var(--mantine-spacing-lg);
  cursor: pointer;

  :hover {
    opacity: 0.7;
  }
`;
