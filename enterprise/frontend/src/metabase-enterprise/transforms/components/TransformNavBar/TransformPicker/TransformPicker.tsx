import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { TreeItem } from "metabase/metadata/components/TreePicker/TreeItem";
import { ActionIcon, Icon } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import { NewTransformMenu } from "metabase-enterprise/transforms/components/NewTransformMenu";
import {
  getTransformSettingsUrl,
  getTransformUrl,
} from "metabase-enterprise/transforms/utils/urls";
import type { Transform } from "metabase-types/api";

export function TransformPicker() {
  const [isExpanded, { toggle }] = useDisclosure();
  const { data: transforms = [] } = useListTransformsQuery(
    isExpanded ? undefined : skipToken,
  );

  return (
    <div>
      <TransformToggle isExpanded={isExpanded} onToggle={toggle} />
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
  isExpanded: boolean;
  onToggle: () => void;
};

function TransformToggle({ isExpanded, onToggle }: TransformToggleProps) {
  return (
    <TreeItem
      label={t`Transforms`}
      icon="refresh_downstream"
      to=""
      isExpanded={isExpanded}
      isExpandable
      onClick={onToggle}
    >
      <ActionIcon
        component={Link}
        variant="transparent"
        to={getTransformSettingsUrl()}
      >
        <Icon name="gear" c="text-primary" />
      </ActionIcon>
      <NewTransformMenu>
        <ActionIcon variant="transparent">
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
      to={getTransformUrl(transform.id)}
      level={1}
    />
  );
}
