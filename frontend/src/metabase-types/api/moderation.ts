export type VerifyItemRequest = {
  status: "verified" | null;
  moderated_item_id: number;
  moderated_item_type: "card";
  text?: string;
};
