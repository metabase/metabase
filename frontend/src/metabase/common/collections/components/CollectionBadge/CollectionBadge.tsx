import { useGetCollectionQuery } from "metabase/api";
import { Breadcrumb } from "metabase/common/components/Breadcrumb";
import { getPickerCollectionName } from "metabase/common/components/Pickers/utils";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { useGetIcon } from "metabase/hooks/use-icon";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { modelToUrl } from "metabase/urls/modelToUrl";
import { getName } from "metabase/utils/name";
import type {
  CollectionId,
  Collection as CollectionType,
  IconName,
} from "metabase-types/api";

const IRREGULAR_ICON_WIDTH = 16;
const IRREGULAR_ICON_PROPS = {
  width: IRREGULAR_ICON_WIDTH,
  height: 16,

  // Workaround: if a CollectionBadge icon has a tooltip, the default offset x is incorrect
  targetOffsetX: IRREGULAR_ICON_WIDTH,
};

/**
 * PROTOTYPE: how a crumb shows its icon — hidden, or replaced based on the
 * full collection (e.g. "Modern nav - C" marks official collections).
 */
export type CollectionBadgeIcon =
  | { kind: "default" }
  | { kind: "hidden" }
  | {
      kind: "custom";
      getIcon: (collection: CollectionType) => IconName | null;
      /** Icon size in px, for both custom and default icons. */
      size?: number;
    };

type CollectionBadgeInnerProps = {
  collection: CollectionType;
  showTooltip?: boolean;
  onClick?: () => void;
  icon?: CollectionBadgeIcon;
  isRegularWeight?: boolean;
};

const CollectionBadgeInner = ({
  collection,
  showTooltip,
  onClick,
  icon: iconMode = { kind: "default" },
  isRegularWeight,
}: CollectionBadgeInnerProps) => {
  const tc = useTranslateContent();
  const getIcon = useGetIcon();

  if (!collection) {
    return null;
  }

  const isRegular = PLUGIN_COLLECTIONS.isRegularCollection(collection);
  const defaultIcon = {
    ...getIcon({ ...collection, model: "collection" }),
    ...(isRegular ? { size: 16 } : IRREGULAR_ICON_PROPS),
  };
  const customIconName =
    iconMode.kind === "custom" ? iconMode.getIcon(collection) : null;
  const icon =
    iconMode.kind === "hidden"
      ? undefined
      : customIconName
        ? { name: customIconName, color: undefined }
        : defaultIcon;

  return (
    <Breadcrumb
      icon={icon?.name}
      iconColor={icon?.color}
      iconSize={iconMode.kind === "custom" ? iconMode.size : undefined}
      showTooltip={showTooltip}
      isRegularWeight={isRegularWeight}
      to={
        onClick ? undefined : modelToUrl({ model: "collection", ...collection })
      }
      onClick={onClick}
    >
      {/* PROTOTYPE: the Library's sections use the nav's names ("Data",
          "Datasets") here too. */}
      {tc(
        getPickerCollectionName({ ...collection, name: getName(collection) }),
      )}
    </Breadcrumb>
  );
};

type CollectionBadgeProps = {
  collectionId?: CollectionId;
  showTooltip?: boolean;
  onClick?: () => void;
  icon?: CollectionBadgeIcon;
  isRegularWeight?: boolean;
};

export const CollectionBadge = ({
  collectionId,
  showTooltip,
  onClick,
  icon,
  isRegularWeight,
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
      icon={icon}
      isRegularWeight={isRegularWeight}
    />
  );
};
