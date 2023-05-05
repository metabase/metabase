import React from "react";
import { Dashboard } from "metabase-types/api";

import ItemPicker, { PickerValue, PickerItemId } from "./ItemPicker";

export interface DashboardPickerProps {
  value?: PickerValue;
  onChange: (dashboardId: PickerItemId | undefined) => void;
  collectionId?: Dashboard["collection_id"];
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
  />
);

export default DashboardPicker;
