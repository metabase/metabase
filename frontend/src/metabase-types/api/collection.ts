export type CollectionId = number | string;

export interface Collection {
  id: CollectionId;
  name: string;
  can_write: boolean;
  personal_owner_id?: number;
}
