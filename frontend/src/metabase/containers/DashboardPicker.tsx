import React from "react";
import { CollectionId, DashboardId } from "metabase-types/api";
import ItemPicker, { PickerValue } from "./ItemPicker";

export interface DashboardPickerProps {
  value?: DashboardId;
  onChange: (dashboardId: DashboardId) => void;
  collectionId?: CollectionId;
}

const DashboardPicker = ({
  value,
  onChange,
  collectionId,
  ...props
}: DashboardPickerProps) => (
  <ItemPicker<DashboardId>
    {...props}
    initialOpenCollectionId={collectionId}
    value={value === undefined ? undefined : { model: "dashboard", id: value }}
    onChange={dashboard => onChange(dashboard.id)}
    models={["dashboard"]}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DashboardPicker;
