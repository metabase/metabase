import type { CardId, CollectionId, DashboardId } from "metabase-types/api";

import type { OmniPickerCollectionItem } from "../EntityPicker";

export type CollectionItemId = CollectionId | CardId | DashboardId;

export type CollectionPickerValueItem =
  | (Omit<OmniPickerCollectionItem, "model" | "id"> & {
      id: CollectionId;
      model: "collection";
    })
  | (Omit<OmniPickerCollectionItem, "model" | "id"> & {
      id: DashboardId;
      model: "dashboard";
      collection_id: CollectionId | null;
    });
