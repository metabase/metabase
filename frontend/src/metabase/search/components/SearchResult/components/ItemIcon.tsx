import type { SearchModelType } from "metabase-types/api";
import { Icon } from "metabase/core/components/Icon";
import type { WrappedResult } from "metabase/search/types";
import { CollectionIcon } from "./CollectionIcon";
import { DefaultIcon } from "./DefaultIcon";
import { IconWrapper } from "./ItemIcon.styled";

interface IconComponentProps {
  item: WrappedResult;
  type: SearchModelType;
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
  item: WrappedResult;
  type: SearchModelType;
}

export const ItemIcon = ({ active, item, type }: ItemIconProps) => {
  return (
    <IconWrapper type={type} active={active}>
      <IconComponent item={item} type={type} />
    </IconWrapper>
  );
};
