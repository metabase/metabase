import React from "react";

import ItemPicker, { PickerValue, PickerItemId } from "./ItemPicker";

export interface DashboardPickerProps {
  value?: PickerValue;
  onChange: (dashboardId: PickerItemId | undefined) => void;
}

const DashboardPicker = ({
  value,
  onChange,
  ...props
}: DashboardPickerProps) => (
  <ItemPicker
    {...props}
    value={value === undefined ? undefined : { model: "dashboard", id: value }}
    onChange={(dashboard: PickerValue) =>
      onChange(dashboard ? dashboard.id : undefined)
    }
    models={["dashboard"]}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DashboardPicker;
