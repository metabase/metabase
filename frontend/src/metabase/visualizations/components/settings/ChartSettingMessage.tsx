import type { PropsWithChildren } from "react";

import { Center, useMantineTheme } from "metabase/ui";

export const ChartSettingMessage = ({ children }: PropsWithChildren) => {
  const theme = useMantineTheme();

  return (
    <Center
      py="md"
      px={0}
      bg="background_page-secondary"
      c="text-disabled"
      fw="bold"
      style={{ borderRadius: theme.radius.md }}
    >
      {children}
    </Center>
  );
};
