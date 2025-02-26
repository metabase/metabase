import type { ReactNode } from "react";

import { Box, Stack, Text } from "metabase/ui";

type AlertModalSettingsBlockProps = {
  title: string;
  children: ReactNode;
};

export const AlertModalSettingsBlock = ({
  title,
  children,
}: AlertModalSettingsBlockProps) => {
  return (
    <Stack gap="0.75rem">
      <Text size="lg" lineClamp={1}>
        {title}
      </Text>
      <Box
        bg="var(--mb-color-background-info)"
        px="2rem"
        py="1.5rem"
        style={{ borderRadius: "0.5rem" }}
      >
        {children}
      </Box>
    </Stack>
  );
};
