import * as Urls from "metabase/lib/urls";
import type { Transform, TransformId } from "metabase-types/api";

import { SidebarListItem } from "./SidebarListItem";

interface TransformListItemProps {
  transform: Transform;
  selectedId?: TransformId;
}

export const TransformListItem = ({
  transform,
  selectedId,
}: TransformListItemProps) => {
  return (
    <SidebarListItem
      icon="transform"
      href={Urls.transform(transform.id)}
      label={transform.name}
      subtitle={transform.target.name}
      isActive={transform.id === selectedId}
    />
  );
};
