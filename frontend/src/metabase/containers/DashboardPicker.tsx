import React from "react";
import { Collection, CollectionId } from "metabase-types/api";
import ItemPicker, { PickerValue, PickerItemId } from "./ItemPicker";

export interface DashboardPickerProps {
  value?: PickerItemId;
  onChange: (dashboardId: PickerItemId | undefined) => void;
  collectionId?: CollectionId;
}

const DashboardPicker = ({
  value,
  onChange,
  collectionId,
  ...props
}: DashboardPickerProps) => (
  <ItemPicker
    {...props}
    initialOpenCollectionId={collectionId}
    value={value === undefined ? undefined : { model: "dashboard", id: value }}
    onChange={(dashboard: PickerValue) =>
      onChange(dashboard ? dashboard.id : undefined)
    }
    models={["dashboard"]}
    collectionFilter={(c: Collection) => c.personal_owner_id === null}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DashboardPicker;
