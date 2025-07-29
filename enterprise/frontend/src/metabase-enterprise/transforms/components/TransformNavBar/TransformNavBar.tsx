import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import type { TransformNavBarProps } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, Box, Flex, Icon } from "metabase/ui";

export function TransformNavBar({ isActive }: TransformNavBarProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  if (!isAdmin) {
    return null;
  }

  return <TransformList isActive={isActive} />;
}

type TransformListProps = {
  isActive: boolean;
};

function TransformList({ isActive }: TransformListProps) {
  return <TransformToggle isActive={isActive} />;
}

type TransformToggleProps = {
  isActive: boolean;
};

function TransformToggle(_props: TransformToggleProps) {
  return (
    <Flex align="center">
      <Icon name="chevrondown" c="text-secondary" mr="xs" />
      <Icon name="refresh_downstream" c="text-secondary" mr="sm" />
      <Box c="text-primary" flex={1} mr="md">{t`Transforms`}</Box>
      <ActionIcon>
        <Icon name="gear" c="text-primary" />
      </ActionIcon>
      <ActionIcon>
        <Icon name="add" c="text-primary" />
      </ActionIcon>
    </Flex>
  );
}
