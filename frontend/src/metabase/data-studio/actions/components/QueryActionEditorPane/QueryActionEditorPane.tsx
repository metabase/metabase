import type { ReactNode } from "react";

import { Box } from "metabase/ui";

type QueryActionEditorPaneProps = {
  children: ReactNode;
};

export function QueryActionEditorPane({
  children,
}: QueryActionEditorPaneProps) {
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
