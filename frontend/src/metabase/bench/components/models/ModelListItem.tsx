import cx from "classnames";
import { Link } from "react-router";

import { getIcon } from "metabase/browse/models/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { FixedSizeIcon, Flex, Group, Text } from "metabase/ui";
import type { RecentCollectionItem } from "metabase-types/api";

import S from "./ModelListItem.module.css";

interface Props {
  model: RecentCollectionItem; // TODO: fix type
  href?: string;
  isSelected: boolean;
}

export const ModelListItem = ({ model, href, isSelected }: Props) => {
  const icon = getIcon({ type: "dataset", ...model });

  return (
    <Group
      mb="sm"
      className={cx({ [S.selectedModelItem]: isSelected })}
      justify="space-between"
      p="xs"
    >
      {/*TODO: support relative URL hosting*/}
      <Link to={href || `/bench/model/${model.id}`}>
        <Flex gap="sm" align="center">
          <FixedSizeIcon {...icon} size={16} c="brand" />
          <Text fw="bold">{model.name}</Text>
        </Flex>
        <Flex gap="sm" c="text-light" ml="lg">
          <FixedSizeIcon name="folder" />
          <EllipsifiedCollectionPath collection={model.collection} />
        </Flex>
      </Link>
    </Group>
  );
};
