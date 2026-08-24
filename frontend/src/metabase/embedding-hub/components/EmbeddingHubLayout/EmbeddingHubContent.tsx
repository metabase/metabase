import type { ReactNode } from "react";

import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import {
  AreaContent,
  CONTENT_PADDING_X,
} from "metabase/nav/components/AreaLayout";
import { Box } from "metabase/ui";

const CONTENT_MAX_WIDTH = "50rem";

type EmbeddingHubContentProps = {
  children?: ReactNode;
  /** The permissions editor is full-width, per the design -- every other hub page caps at 800px. */
  fullWidth?: boolean;
};

export function EmbeddingHubContent({
  children,
  fullWidth = false,
}: EmbeddingHubContentProps) {
  return (
    <Box
      data-testid="embedding-hub-main"
      h="100%"
      bg="background_page-secondary"
      pos="relative"
      style={{ overflow: "hidden" }}
    >
      <Box
        pos="absolute"
        top="1.5rem"
        right={CONTENT_PADDING_X}
        bg="background_page-secondary"
        bdrs="50%"
        style={{ zIndex: 10 }}
      >
        <AppSwitcher />
      </Box>
      <AreaContent fullWidth={fullWidth}>
        {fullWidth ? (
          children
        ) : (
          <Box
            maw={CONTENT_MAX_WIDTH}
            mx="auto"
            w="100%"
            data-testid="embedding-hub-content-cap"
          >
            {children}
          </Box>
        )}
      </AreaContent>
    </Box>
  );
}
