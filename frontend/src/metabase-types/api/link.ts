import type { CardId } from "./card";
import type { CollectionId } from "./collection";
import type { DashboardId } from "./dashboard";
import type { SearchModel } from "./search";
import type { TableId } from "./table";

export type LinkId = CardId | DashboardId | CollectionId | TableId;

export type CreateLinkRequest = {
  model: SearchModel;
  id: LinkId;
  collection_id?: CollectionId;
};
