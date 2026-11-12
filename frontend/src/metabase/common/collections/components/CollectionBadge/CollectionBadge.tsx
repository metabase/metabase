import { useGetCollectionQuery } from "metabase/api";
import { Breadcrumb } from "metabase/common/components/Breadcrumb";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { useGetIcon } from "metabase/hooks/use-icon";
import { modelToUrl } from "metabase/urls/modelToUrl";
import { getName } from "metabase/utils/name";
import type {
  CollectionId,
  Collection as CollectionType,
} from "metabase-types/api";

type CollectionBadgeInnerProps = {
  collection: CollectionType;
  showTooltip?: boolean;
  onClick?: () => void;
};

const CollectionBadgeInner = ({
  collection,
  showTooltip,
  onClick,
}: CollectionBadgeInnerProps) => {
  const tc = useTranslateContent();
  const getIcon = useGetIcon();

  if (!collection) {
    return null;
  }

  const icon = getIcon({ ...collection, model: "collection" });

  return (
    <Breadcrumb
      icon={icon.name}
      iconColor={icon.color}
      showTooltip={showTooltip}
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
  showTooltip?: boolean;
  onClick?: () => void;
};

export const CollectionBadge = ({
  collectionId,
  showTooltip,
  onClick,
}: CollectionBadgeProps) => {
  const { data: collection } = useGetCollectionQuery({
    id: collectionId || "root",
  });
  if (!collection) {
    return null;
  }
  return (
    <CollectionBadgeInner
      collection={collection}
      showTooltip={showTooltip}
      onClick={onClick}
    />
  );
};
