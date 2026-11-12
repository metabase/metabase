import type { ReactNode } from "react";

import { useParams } from "metabase/router";
import { Box } from "metabase/ui";

import S from "./DataAppLayout.module.css";

interface DataAppLayoutProps {
  children: ReactNode;
}

export function DataAppLayout({ children }: DataAppLayoutProps) {
  const { slug } = useParams<{ slug: string }>();

  return (
    <Box className={S.root}>
      {/* Key on the app slug so navigating between apps remounts the host (and
          its iframe) with the new app. Sub-path mirroring keeps the same
          `:slug`, so internal navigation never triggers a reload. */}
      <Box key={slug} className={S.content}>
        {children}
      </Box>
    </Box>
  );
}
