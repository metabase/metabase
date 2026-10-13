import type { ReactNode } from "react";

import { Box } from "metabase/ui";

type ActionEditorPaneProps = {
  children: ReactNode;
};

export function ActionEditorPane({ children }: ActionEditorPaneProps) {
  return (
    <Box
      w="100%"
      bg="background_page-primary"
      bdrs="sm"
      bd="1px solid var(--mb-color-border-neutral)"
      flex={1}
      style={{ overflow: "hidden" }}
    >
      {children}
    </Box>
  );
}
