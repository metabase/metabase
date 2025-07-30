import { useDisclosure } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { TreeItem } from "metabase/metadata/components/TreePicker/TreeItem";
import type { TransformPickerProps } from "metabase/plugins";
import { ActionIcon, Flex, Icon } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import { NewTransformMenu } from "metabase-enterprise/transforms/components/NewTransformMenu";
import {
  getTransformRootUrl,
  getTransformSettingsUrl,
  getTransformUrl,
} from "metabase-enterprise/transforms/utils/urls";
import type { Transform } from "metabase-types/api";

import S from "./TransformPicker.module.css";

export function TransformPicker({ isActive }: TransformPickerProps) {
  const [isExpanded, { toggle }] = useDisclosure();
  const { data: transforms = [] } = useListTransformsQuery();

  return (
    <div>
      <TransformRootItem
        isActive={isActive}
        isExpanded={isExpanded}
        isExpandable={transforms.length > 0}
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

type TransformRootItemProps = {
  isActive: boolean;
  isExpanded: boolean;
  isExpandable: boolean;
  onToggle: () => void;
};

function TransformRootItem({
  isActive,
  isExpanded,
  isExpandable,
  onToggle,
}: TransformRootItemProps) {
  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <TreeItem
      label={t`Transforms`}
      icon="refresh_downstream"
      to={isExpandable ? "" : getTransformRootUrl()}
      isActive={isActive}
      isExpanded={isExpanded}
      isExpandable={isExpandable}
      onClick={onToggle}
    >
      {isExpandable && (
        <Flex>
          <ActionIcon
            className={S.icon}
            component={Link}
            variant="transparent"
            to={getTransformSettingsUrl()}
            onClick={handleClick}
          >
            <Icon name="gear" />
          </ActionIcon>
          <NewTransformMenu>
            <ActionIcon
              className={S.icon}
              variant="transparent"
              onClick={handleClick}
            >
              <Icon name="add" />
            </ActionIcon>
          </NewTransformMenu>
        </Flex>
      )}
    </TreeItem>
  );
}
