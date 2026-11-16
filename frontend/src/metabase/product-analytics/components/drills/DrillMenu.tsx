import type { ReactNode } from "react";

import { Box, Button, Icon, Loader, Stack, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./DrillMenu.module.css";

export type DrillMenuItem = {
  key: string;
  title: string;
  icon: IconName;
  onClick: () => void;
};

type DrillMenuProps = {
  title?: string;
  items: DrillMenuItem[];
  /** Shown instead of the items, e.g. while an item's action runs. */
  status?: ReactNode;
};

/** A list of actions styled like the chart click actions. */
export const DrillMenu = ({ title, items, status }: DrillMenuProps) => (
  <Stack gap="sm" px="xl" py="lg" fw={700} miw={280}>
    {title && (
      <Text c="text-secondary" fw="bold" fz="sm">
        {title}
      </Text>
    )}
    {status ??
      items.map((item) => (
        <Button
          key={item.key}
          p="0.5rem"
          mx="-0.5rem"
          variant="subtle"
          color="neutral"
          className={S.item}
          leftSection={<Icon name={item.icon} />}
          onClick={item.onClick}
        >
          {item.title}
        </Button>
      ))}
  </Stack>
);

export const DrillMenuLoader = ({ label }: { label: string }) => (
  <Box py="md">
    <Stack align="center" gap="sm">
      <Loader size="sm" />
      <Text c="text-secondary">{label}</Text>
    </Stack>
  </Box>
);
