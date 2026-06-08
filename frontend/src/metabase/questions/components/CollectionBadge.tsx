import { useGetCollectionQuery } from "metabase/api";
import { Breadcrumb } from "metabase/common/components/Breadcrumb";
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
  collection: CollectionType;
  onClick?: () => void;
};

const CollectionBadgeInner = ({
  collection,
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

  return (
    <Breadcrumb
      icon={icon.name}
      iconColor={icon.color}
      to={
        onClick ? undefined : modelToUrl({ model: "collection", ...collection })
      }
      onClick={onClick}
    >
      {tc(getName(collection))}
    </Breadcrumb>
  );
};

type CollectionBadgeProps = {
  collectionId?: CollectionId;
  onClick?: () => void;
};

export const CollectionBadge = ({
  collectionId,
  onClick,
}: CollectionBadgeProps) => {
  const { data: collection } = useGetCollectionQuery({
    id: collectionId || "root",
  });
  if (!collection) {
    return null;
  }
  return <CollectionBadgeInner collection={collection} onClick={onClick} />;
};
