// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { CSSProperties } from "react";

import type { BoxProps } from "metabase/ui";
import { Box, Icon } from "metabase/ui";

export const UndoList = styled.ul`
  position: fixed;
  left: 0;
  bottom: 0;
  margin: var(--mantine-spacing-lg);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

export const CardContent = styled.div<{
  alignItems?: CSSProperties["alignItems"];
}>`
  display: flex;
  align-items: ${({ alignItems = "flex-start" }) => alignItems};
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
  margin-right: var(--mantine-spacing-sm);
  flex-shrink: 0;
`;

export const DismissIcon = styled(Icon)<{ color?: string }>`
  position: relative;
  top: 1px;
  margin-left: var(--mantine-spacing-lg);
  cursor: pointer;

  :hover {
    opacity: 0.7;
  }
`;
