import type { ReactNode } from "react";

import { Box, Flex, rem } from "metabase/ui";

import { DESCRIPTION_ICON_SIZE, ScalarDescription } from "../ScalarDescription";

const DESCRIPTION_ICON_GAP = 8;
const DESCRIPTION_ICON_SPACE = DESCRIPTION_ICON_SIZE + DESCRIPTION_ICON_GAP;

interface ScalarLabelProps {
  children: ReactNode;
  description?: string | null;
  xPadding: number;
}

export function ScalarLabel({
  children,
  description,
  xPadding,
}: ScalarLabelProps) {
  // The icon sits in the card's side padding. What a narrow padding cannot
  // hold is reserved on both sides, to keep the text centered.
  const reservedSpace = description
    ? Math.max(DESCRIPTION_ICON_SPACE - xPadding, 0)
    : 0;
  const maxWidth =
    reservedSpace > 0 ? `calc(100% - ${rem(2 * reservedSpace)})` : "100%";

  return (
    <Flex
      pos="relative"
      align="center"
      justify="center"
      gap="xxs"
      miw={0}
      maw={maxWidth}
      data-testid="scalar-label"
    >
      {children}
      {description && (
        <Box pos="absolute" left={`calc(100% + ${rem(DESCRIPTION_ICON_GAP)})`}>
          <ScalarDescription description={description} />
        </Box>
      )}
    </Flex>
  );
}
