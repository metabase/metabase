import type { ReactNode } from "react";

import { Box, Flex, rem } from "metabase/ui";

import { DESCRIPTION_ICON_SIZE, ScalarDescription } from "../ScalarDescription";

const DESCRIPTION_ICON_GAP = 8;
const DESCRIPTION_ICON_SPACE = DESCRIPTION_ICON_SIZE + DESCRIPTION_ICON_GAP;

interface ScalarLabelProps {
  children: ReactNode;
  description?: string | null;
}

export function ScalarLabel({ children, description }: ScalarLabelProps) {
  // Reserve equal icon space on both sides to keep the text centered and the icon inside the padding.
  const maxWidth = description
    ? `calc(100% - ${rem(2 * DESCRIPTION_ICON_SPACE)})`
    : "100%";

  return (
    <Flex
      pos="relative"
      align="center"
      justify="center"
      gap="xxs"
      miw={0}
      maw={maxWidth}
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
