import type { ReactNode } from "react";

import { Box } from "metabase/ui";

import S from "./DataAppLayout.module.css";

interface DataAppLayoutProps {
  params: { name: string };
  children: ReactNode;
}

export function DataAppLayout({ params, children }: DataAppLayoutProps) {
  const { name } = params;

  return (
    <Box className={S.root}>
      {/* Key on the app slug so navigating between apps remounts the host (and
          its iframe) with the new app. Sub-path mirroring keeps the same
          `:name`, so internal navigation never triggers a reload. */}
      <Box key={name} className={S.content}>
        {children}
      </Box>
    </Box>
  );
}
