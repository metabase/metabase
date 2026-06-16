import { Icon } from "metabase/ui";
import type { RecentItem, SearchModel, SearchResult } from "metabase-types/api";

import { CollectionIcon } from "./CollectionIcon";
import { DefaultIcon } from "./DefaultIcon";
import { IconWrapper } from "./ItemIcon.styled";

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
    <IconWrapper
      type={type}
      active={active}
      archived={archived}
      data-testid={dataTestId}
    >
      <IconComponent item={item} type={type} />
    </IconWrapper>
  );
};
