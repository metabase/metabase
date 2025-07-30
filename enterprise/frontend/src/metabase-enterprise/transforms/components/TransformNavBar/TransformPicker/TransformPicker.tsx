import { useDisclosure } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { TreeItem } from "metabase/metadata/components/TreePicker/TreeItem";
import { ActionIcon, Flex, Icon } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import { NewTransformMenu } from "metabase-enterprise/transforms/components/NewTransformMenu";
import {
  getTransformSettingsUrl,
  getTransformUrl,
} from "metabase-enterprise/transforms/utils/urls";
import type { Transform } from "metabase-types/api";

import S from "./TransformPicker.module.css";

export function TransformPicker() {
  const [isExpanded, { toggle }] = useDisclosure();
  const { data: transforms = [] } = useListTransformsQuery(
    isExpanded ? undefined : skipToken,
  );

  return (
    <div>
      <TransformRootItem isExpanded={isExpanded} onToggle={toggle} />
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
  isExpanded: boolean;
  onToggle: () => void;
};

function TransformRootItem({ isExpanded, onToggle }: TransformRootItemProps) {
  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <TreeItem
      label={t`Transforms`}
      icon="refresh_downstream"
      to=""
      isExpanded={isExpanded}
      isExpandable
      onClick={onToggle}
    >
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
    </TreeItem>
  );
}
