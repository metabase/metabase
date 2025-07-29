import { Link } from "react-router";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import type { TransformNavBarProps } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, Box, Flex, Icon, UnstyledButton } from "metabase/ui";
import { NewTransformMenu } from "metabase-enterprise/transforms/components/NewTransformMenu";
import { getTransformSettingsUrl } from "metabase-enterprise/transforms/utils/urls";

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
      <UnstyledButton mr="md">
        <Flex align="center">
          <Icon name="chevrondown" c="text-secondary" mr="xs" />
          <Icon name="refresh_downstream" c="text-secondary" mr="sm" />
          <Box c="text-primary" flex={1} mr="md">{t`Transforms`}</Box>
        </Flex>
      </UnstyledButton>
      <ActionIcon component={Link} to={getTransformSettingsUrl()}>
        <Icon name="gear" c="text-primary" />
      </ActionIcon>
      <NewTransformMenu>
        <ActionIcon>
          <Icon name="add" c="text-primary" />
        </ActionIcon>
      </NewTransformMenu>
    </Flex>
  );
}
