import cx from "classnames";
import { t } from "ttag";

import { EDITOR_STYLE_BOUNDARY_CLASS } from "metabase/documents/components/Editor/constants";
import { Box, Flex, Loader, Text } from "metabase/ui";

import styles from "./CardEmbedNode.module.css";

type Props = {
  selected?: boolean;
};

export const CardEmbedLoadingState = ({ selected }: Props) => {
  return (
    <Box
      className={cx(styles.cardEmbed, EDITOR_STYLE_BOUNDARY_CLASS, {
        [styles.selected]: selected,
      })}
    >
      <Box className={styles.questionHeader}>
        <Flex align="center" justify="space-between" gap="0.5rem">
          <Box className={styles.titleContainer}>
            <Text size="md" c="text-primary" fw={700}>
              {t`Loading question...`}
            </Text>
          </Box>
        </Flex>
      </Box>

      <Box className={styles.questionResults}>
        <Box className={styles.loadingContainer}>
          <Loader />
        </Box>
      </Box>
    </Box>
  );
};
