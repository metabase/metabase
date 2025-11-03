import { Box, Repeat, Skeleton } from "metabase/ui";

import S from "./SidebarLoadingState.module.css";

export const SidebarLoadingState = () => {
  return (
    <Box className={S.container} px="md">
      <Repeat times={8}>
        <Skeleton h={40} mb="md" radius="sm" />
      </Repeat>
    </Box>
  );
};
