import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { TreeItem } from "metabase/metadata/components/TreePicker/TreeItem";
import type { TransformNavBarProps } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, Icon } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import { NewTransformMenu } from "metabase-enterprise/transforms/components/NewTransformMenu";
import {
  getTransformSettingsUrl,
  getTransformUrl,
} from "metabase-enterprise/transforms/utils/urls";
import type { Transform } from "metabase-types/api";

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
    <TreeItem
      label={t`Transforms`}
      icon="refresh_downstream"
      href=""
      isExpanded={isExpanded}
      isExpandable
      onClick={onToggle}
    >
      <ActionIcon component={Link} to={getTransformSettingsUrl()}>
        <Icon name="gear" c="text-primary" />
      </ActionIcon>
      <NewTransformMenu>
        <ActionIcon>
          <Icon name="add" c="text-primary" />
        </ActionIcon>
      </NewTransformMenu>
    </TreeItem>
  );
}

type TransformItemProps = {
  transform: Transform;
};

function TransformItem({ transform }: TransformItemProps) {
  return (
    <TreeItem
      label={transform.name}
      icon="refresh_downstream"
      href={getTransformUrl(transform.id)}
      level={1}
    />
  );
}
