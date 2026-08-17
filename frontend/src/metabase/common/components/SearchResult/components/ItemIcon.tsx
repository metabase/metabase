import { Flex, Icon, rem } from "metabase/ui";
import { lighten } from "metabase/ui/colors";
import { color } from "metabase/ui/utils/colors";
import type { RecentItem, SearchModel, SearchResult } from "metabase-types/api";

import { CollectionIcon } from "./CollectionIcon";
import { DefaultIcon } from "./DefaultIcon";

function getColorForIconWrapper(
  active: boolean,
  archived: boolean,
  type: SearchModel,
) {
  if (!active || archived) {
    return color("text-secondary");
  }
  if (type === "collection") {
    return lighten("core-brand", 0.35);
  }
  return color("core-brand");
}

export interface IconComponentProps {
  item: SearchResult | RecentItem;
  type: SearchModel;
}

const IconComponent = ({ item, type }: IconComponentProps) => {
  if (type === "table") {
    return <Icon name="database" />;
  }

  if (type === "collection") {
    return <CollectionIcon item={item} />;
  }

  return <DefaultIcon item={item} />;
};

interface ItemIconProps {
  active: boolean;
  item: SearchResult | RecentItem;
  type: SearchModel;
  "data-testid"?: string;
}

export const ItemIcon = ({
  active,
  item,
  type,
  "data-testid": dataTestId,
}: ItemIconProps) => {
  const archived = Boolean("archived" in item && item.archived);

  return (
    <Flex
      align="center"
      justify="center"
      w={rem(32)}
      h={rem(32)}
      flex="0 0 auto"
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      bg="background_page-primary"
      style={{ color: getColorForIconWrapper(active, archived, type) }}
      data-testid={dataTestId}
    >
      <IconComponent item={item} type={type} />
    </Flex>
  );
};
