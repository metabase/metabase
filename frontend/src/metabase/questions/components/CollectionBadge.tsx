import type { ComponentType, PropsWithChildren } from "react";

import { Badge } from "metabase/common/components/Badge";
import { getIcon } from "metabase/common/utils/icon";
import { Collections } from "metabase/entities/collections";
import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { modelToUrl } from "metabase/urls/modelToUrl";
import { getName } from "metabase/utils/name";
import type {
  CollectionId,
  Collection as CollectionType,
} from "metabase-types/api";
import type { WrappedEntity } from "metabase-types/entities";

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
      {tc(getName(collection))}
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
