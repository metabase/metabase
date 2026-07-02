import {
  DEFAULT_ICON_SIZE,
  LARGE_ICON_SIZE,
} from "metabase/common/components/SearchResult/components";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Icon } from "metabase/ui";

import type { IconComponentProps } from "./ItemIcon";

export const CollectionIcon = ({
  item,
}: {
  item: IconComponentProps["item"];
}) => {
  const getIcon = useGetIcon();
  const icon = getIcon(item);

  icon.color = icon.color ? icon.color : "text-disabled";

  return (
    <Icon
      {...{ ...icon, c: icon.color }}
      size={icon.name === "folder" ? DEFAULT_ICON_SIZE : LARGE_ICON_SIZE}
    />
  );
};
