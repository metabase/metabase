import type { CollectionId, DashboardId } from "metabase-types/api";
import type { ItemPickerProps } from "./ItemPicker/ItemPicker";

import ItemPicker from "./ItemPicker";

export interface DashboardPickerProps
  extends Pick<
    ItemPickerProps<DashboardId>,
    "showOnlyPersonalCollections" | "onOpenCollectionChange"
  > {
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
  <ItemPicker
    {...props}
    initialOpenCollectionId={collectionId}
    value={value === undefined ? undefined : { model: "dashboard", id: value }}
    onChange={dashboard => onChange(dashboard.id)}
    models={["dashboard"]}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DashboardPicker;
