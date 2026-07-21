import { Box, Stack } from "metabase/ui";

import S from "./ExplorationSidebar.module.css";

export function ExplorationSidebarSkeleton() {
  return (
    <Stack
      flex={1}
      pl="0.5rem"
      pb="3rem"
      gap="sm"
      data-testid="exploration-sidebar-skeleton"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <Box key={index} className={S.skeletonRow} />
      ))}
    </Stack>
  );
}
