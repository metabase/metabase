export type CollectionId = number | "root";

export type CollectionContentModel = "card" | "dataset";

export type Collection = {
  id: CollectionId;
  name: string;
  can_write: boolean;
  archived: boolean;
  children?: Collection[];

  personal_owner_id?: number | unknown;

  location?: string;
  effective_ancestors?: Collection[];

  here?: CollectionContentModel[];
  below?: CollectionContentModel[];

  // Assigned on FE
  originalName?: string;
};
