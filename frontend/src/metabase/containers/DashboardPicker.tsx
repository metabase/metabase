import type { CollectionId, DashboardId } from "metabase-types/api";
import ItemPicker from "./ItemPicker";

export interface DashboardPickerProps {
  value?: DashboardId;
  onChange: (dashboardId: DashboardId) => void;
  collectionId?: CollectionId;
  showOnlyPersonalCollections?: boolean;
}

const DashboardPicker = ({
  value,
  onChange,
  collectionId,
  showOnlyPersonalCollections,
  ...props
}: DashboardPickerProps) => (
  <ItemPicker
    {...props}
    showOnlyPersonalCollections={showOnlyPersonalCollections}
    initialOpenCollectionId={collectionId}
    value={value === undefined ? undefined : { model: "dashboard", id: value }}
    onChange={dashboard => onChange(dashboard.id)}
    models={["dashboard"]}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DashboardPicker;
