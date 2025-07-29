import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { Link } from "react-router";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import type { TransformNavBarProps } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, Box, Flex, Icon, UnstyledButton } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import { NewTransformMenu } from "metabase-enterprise/transforms/components/NewTransformMenu";
import {
  getTransformSettingsUrl,
  getTransformUrl,
} from "metabase-enterprise/transforms/utils/urls";
import type { Transform } from "metabase-types/api";

import S from "./TransformNavBar.module.css";

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
  const [isExpanded, { toggle }] = useDisclosure();
  const { data: transforms = [] } = useListTransformsQuery(
    isExpanded ? undefined : skipToken,
  );

  return (
    <div>
      <TransformToggle
        isActive={isActive}
        isExpanded={isExpanded}
        onToggle={toggle}
      />
      {isExpanded && (
        <div>
          {transforms.map((transform) => (
            <TransformItem key={transform.id} transform={transform} />
          ))}
        </div>
      )}
    </div>
  );
}

type TransformToggleProps = {
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
};

function TransformToggle({ isExpanded, onToggle }: TransformToggleProps) {
  return (
    <Flex align="center">
      <UnstyledButton mr="md" flex={1} onClick={onToggle}>
        <Flex align="center">
          <Icon
            className={cx(S.chevron, {
              [S.expanded]: isExpanded,
            })}
            name="chevronright"
            c="text-light"
            mr="xs"
            size={10}
          />
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

type TransformItemProps = {
  transform: Transform;
};

function TransformItem({ transform }: TransformItemProps) {
  return (
    <Flex component={Link} align="center" to={getTransformUrl(transform.id)}>
      <Icon name="refresh_downstream" c="text-secondary" mr="sm" />
      <Box c="text-primary" flex={1}>
        {transform.name}
      </Box>
    </Flex>
  );
}
