import { Box, Loader, Stack } from "metabase/ui";

import styles from "./CardEmbedNode.module.css";

export const CardEmbedLoadingState = () => {
  return (
    <Stack align="center" justify="center" h="100%">
      <Box className={styles.questionResults}>
        <Box className={styles.loadingContainer}>
          <Loader />
        </Box>
      </Box>
    </Stack>
  );
};
