import { merge } from "icepick";
import { ActionDashboardCard, DataApp, Dashboard } from "metabase-types/api";
import { createMockCollection } from "./collection";
import { createMockDashboard } from "./dashboard";

export const createMockDataApp = ({
  collection: collectionProps,
  ...dataAppProps
}: Omit<Partial<DataApp>, "collection_id"> = {}): DataApp => {
  const collection = createMockCollection(collectionProps);
  return {
    id: 1,
    dashboard_id: null,
    options: null,
    nav_items: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...dataAppProps,
    collection_id: collection.id as number,
    collection,
  };
};

export const createMockDataAppPage = (
  params: Partial<Omit<Dashboard, "is_app_page">>,
): Dashboard => createMockDashboard({ ...params, is_app_page: true });

export const createMockDashboardActionButton = ({
  visualization_settings,
  ...opts
}: Partial<ActionDashboardCard> = {}): ActionDashboardCard => ({
  id: 1,
  parameter_mappings: null,
  visualization_settings: merge(
    {
      virtual_card: {
        display: "action",
      },
    },
    visualization_settings,
  ),
  ...opts,
});
