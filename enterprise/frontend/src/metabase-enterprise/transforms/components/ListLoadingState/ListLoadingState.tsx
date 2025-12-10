import { Box, Repeat, Skeleton } from "metabase/ui";

import S from "./ListLoadingState.module.css";

export const ListLoadingState = () => {
  return (
    <Box className={S.container} px="md" pt="md">
      <Repeat times={8}>
        <Skeleton h={40} mb="md" radius="sm" />
      </Repeat>
    </Box>
  );
};
