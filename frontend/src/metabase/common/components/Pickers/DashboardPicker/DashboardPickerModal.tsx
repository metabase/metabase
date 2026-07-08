import { useCallback } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  EntityPickerModal,
  type EntityPickerModalProps,
  type OmniPickerItem,
} from "../EntityPicker";

export const DashboardPickerModal = ({
  title = t`Choose a dashboard`,
  onChange,
  onClose,
  value = { model: "collection", id: "root" },
  options = {},
  isSelectableItem: isSelectableItemProp,
  ...rest
}: Omit<EntityPickerModalProps, "models">) => {
  const searchParams:
    | { filter_items_in_personal_collection?: "only" | "exclude" }
    | undefined = match(options)
    .with({ hasRootCollection: false }, () => ({
      filter_items_in_personal_collection: "only" as const,
    }))
    .with({ hasPersonalCollections: false }, () => ({
      filter_items_in_personal_collection: "exclude" as const,
    }))
    .otherwise(() => undefined);

  const canCreateDashboards = options.canCreateDashboards ?? true;

  const canSelectItem = useCallback(
    (item: OmniPickerItem) => {
      if (item.model !== "dashboard") {
        return false;
      }

      if (isSelectableItemProp && !isSelectableItemProp(item)) {
        return false;
      }

      return true;
    },
    [isSelectableItemProp],
  );

  return (
    <EntityPickerModal
      title={title}
      onChange={onChange}
      onClose={onClose}
      value={value}
      options={{
        canCreateDashboards,
        ...options,
      }}
      searchParams={searchParams}
      {...rest}
      // if the user can create a dashboard, they should be able to navigate the whole collection tree
      // so they can create a dashboard in any collection, not just those that already have dashboards
      models={canCreateDashboards ? ["dashboard", "collection"] : ["dashboard"]}
      isSelectableItem={canSelectItem}
    />
  );
};
