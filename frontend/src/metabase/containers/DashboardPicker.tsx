import type { CollectionId, DashboardId } from "metabase-types/api";
import ItemPicker from "./ItemPicker";

export interface DashboardPickerProps {
  value?: DashboardId;
  onChange: (dashboardId: DashboardId) => void;
  collectionId?: CollectionId;
  shouldFetchDashboards?: boolean;
  onOpenCollectionChange?: (collectionId: CollectionId) => void;
}

const DashboardPicker = ({
  value,
  onChange,
  collectionId,
  shouldFetchDashboards,
  ...props
}: DashboardPickerProps) => (
  <ItemPicker
    {...props}
    initialOpenCollectionId={collectionId}
    value={value === undefined ? undefined : { model: "dashboard", id: value }}
    onChange={dashboard => onChange(dashboard.id)}
    models={["dashboard"]}
    shouldFetchItems={shouldFetchDashboards}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DashboardPicker;
