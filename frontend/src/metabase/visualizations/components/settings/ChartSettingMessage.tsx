import type { PropsWithChildren } from "react";

import { Center, useMantineTheme } from "metabase/ui";

export const ChartSettingMessage = ({ children }: PropsWithChildren) => {
  const theme = useMantineTheme();

  return (
    <Center
      py="md"
      px={0}
      bg="bg-light"
      c="text-light"
      fw="bold"
      style={{ borderRadius: theme.radius.md }}
    >
      {children}
    </Center>
  );
};
