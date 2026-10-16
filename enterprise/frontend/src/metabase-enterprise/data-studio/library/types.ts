import type { Dashboard, Document } from "metabase-types/api";

/** The models that get an item page in the Data Studio Library */
export type LibraryItemModel = "dashboard" | "document";

export type LibraryItem = Dashboard | Document;

/** An item paired with its model, so model-specific links and mutations can be built from it */
export type LibraryItemRef =
  | { model: "dashboard"; item: Dashboard }
  | { model: "document"; item: Document };

export type LibraryItemModelOf<Item extends LibraryItem> = Extract<
  LibraryItemRef,
  { item: Item }
>["model"];
