import type { ReactNode } from "react";

import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { Box } from "metabase/ui";

import { AreaContent, CONTENT_PADDING_X } from "./AreaContent";

type AreaMainProps = {
  testId?: string;
  sidebar?: ReactNode;
  children?: ReactNode;
};

/**
 * Content region of an area app: the scrollable page plus the AppSwitcher,
 * which floats over the page as the only way back out of the area.
 */
export function AreaMain({ testId, sidebar, children }: AreaMainProps) {
  return (
    <Box
      h="100%"
      bg="background_page-secondary"
      display="flex"
      style={{ overflow: "hidden" }}
    >
      <Box data-testid={testId} h="100%" pos="relative" flex="1 1 auto" miw={0}>
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
        <AreaContent>{children}</AreaContent>
      </Box>
      {sidebar}
    </Box>
  );
}
