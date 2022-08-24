import { DataApp } from "metabase-types/api";
import { createMockCollection } from "./collection";

export const createMockDataApp = ({
  collection: collectionProps,
  ...dataAppProps
}: Omit<Partial<DataApp>, "collection_id"> = {}): DataApp => {
  const collection = createMockCollection(collectionProps);
  return {
    id: 1,
    dashboard_id: null,
    options: null,
    nav_items: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...dataAppProps,
    collection_id: collection.id as number,
    collection,
  };
};
