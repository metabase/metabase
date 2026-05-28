import { useGetCollectionQuery } from "metabase/api";
import { Badge } from "metabase/common/components/Badge";
import { useGetIcon } from "metabase/hooks/use-icon";
import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { modelToUrl } from "metabase/urls/modelToUrl";
import { getName } from "metabase/utils/name";
import type {
  CollectionId,
  Collection as CollectionType,
} from "metabase-types/api";

const IRREGULAR_ICON_WIDTH = 16;
const IRREGULAR_ICON_PROPS = {
  width: IRREGULAR_ICON_WIDTH,
  height: 16,

  // Workaround: if a CollectionBadge icon has a tooltip, the default offset x is incorrect
  targetOffsetX: IRREGULAR_ICON_WIDTH,
};

type CollectionBadgeInnerProps = {
  className?: string;
  collection: CollectionType;
  isSingleLine?: boolean;
  onClick?: () => void;
};

const CollectionBadgeInner = ({
  className,
  collection,
  isSingleLine,
  onClick,
}: CollectionBadgeInnerProps) => {
  const tc = useTranslateContent();
  const getIcon = useGetIcon();

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

type CollectionBadgeProps = {
  className?: string;
  collectionId?: CollectionId;
  isSingleLine?: boolean;
  onClick?: () => void;
};

export const CollectionBadge = ({
  collectionId,
  ...rest
}: CollectionBadgeProps) => {
  const { data: collection } = useGetCollectionQuery({
    id: collectionId || "root",
  });
  if (!collection) {
    return null;
  }
  return <CollectionBadgeInner collection={collection} {...rest} />;
};
