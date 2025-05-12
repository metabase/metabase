import type { ReactNode } from "react";

import { Box, type BoxProps, Stack, type StackProps, Text } from "metabase/ui";

import styles from "./AlertModalSettingsBlock.module.css";

type AlertModalSettingsBlockProps = {
  title: string;
  children: ReactNode;
  contentProps?: BoxProps;
} & StackProps;

export const AlertModalSettingsBlock = ({
  title,
  children,
  className,
  contentProps,
  ...stackProps
}: AlertModalSettingsBlockProps) => {
  return (
    <Stack gap="0.75rem" pos="relative" {...stackProps}>
      <Text size="lg" lineClamp={1}>
        {title}
      </Text>
      <Box className={styles.contentContainer} {...contentProps}>
        {children}
      </Box>
    </Stack>
  );
};
