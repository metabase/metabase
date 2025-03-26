import type { ReactNode } from "react";

import { Box, Stack, type StackProps, Text } from "metabase/ui";

import styles from "./AlertModalSettingsBlock.module.css";

type AlertModalSettingsBlockProps = {
  title: string;
  children: ReactNode;
} & StackProps;

export const AlertModalSettingsBlock = ({
  title,
  children,
  className,
  ...stackProps
}: AlertModalSettingsBlockProps) => {
  return (
    <Stack gap="0.75rem" {...stackProps}>
      <Text size="lg" lineClamp={1}>
        {title}
      </Text>
      <Box className={styles.contentContainer}>{children}</Box>
    </Stack>
  );
};
