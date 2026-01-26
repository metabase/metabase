import type { ComponentType, PropsWithChildren } from "react";

import { Badge } from "metabase/common/components/Badge";
import { Collections } from "metabase/entities/collections";
import { useTranslateContent } from "metabase/i18n/hooks";
import { getIcon } from "metabase/lib/icon";
import { modelToUrl } from "metabase/lib/urls/modelToUrl";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import type {
  CollectionId,
  Collection as CollectionType,
} from "metabase-types/api";
import type { WrappedEntity } from "metabase-types/entities";
import type { State } from "metabase-types/store";

const IRREGULAR_ICON_WIDTH = 16;
const IRREGULAR_ICON_PROPS = {
  width: IRREGULAR_ICON_WIDTH,
  height: 16,

  // Workaround: if a CollectionBadge icon has a tooltip, the default offset x is incorrect
  targetOffsetX: IRREGULAR_ICON_WIDTH,
};

type CollectionBadgeProps = {
  className?: string;
  collection: WrappedEntity<CollectionType>;
  isSingleLine?: boolean;
  onClick?: () => void;
};

const CollectionBadgeInner = ({
  className,
  collection,
  isSingleLine,
  onClick,
}: CollectionBadgeProps) => {
  const tc = useTranslateContent();

  if (!collection) {
    return null;
  }

  const isRegular = PLUGIN_COLLECTIONS.isRegularCollection(collection);
  const icon = {
    ...getIcon({ ...collection, model: "collection" }),
    ...(isRegular ? { size: 16 } : IRREGULAR_ICON_PROPS),
  };

  const clickActionProps = onClick
    ? { onClick }
    : { to: modelToUrl({ model: "collection", ...collection }) };
  return (
    <Badge
      className={className}
      icon={icon}
      activeColor={icon.color}
      inactiveColor="text-tertiary"
      isSingleLine={isSingleLine}
      {...clickActionProps}
    >
      {tc(collection.getName())}
    </Badge>
  );
};

export const CollectionBadge = Collections.load({
  id: (state: State, props: { collectionId?: CollectionId }) =>
    props.collectionId || "root",
  wrapped: true,
  loadingAndErrorWrapper: false,
})(CollectionBadgeInner) as ComponentType<
  PropsWithChildren<
    {
      collectionId?: CollectionId;
    } & Omit<CollectionBadgeProps, "collection">
  >
>;
