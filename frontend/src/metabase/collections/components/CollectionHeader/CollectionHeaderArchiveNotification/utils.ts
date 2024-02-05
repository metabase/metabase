// TODO: move it type file
export interface Item {
  id: number;
  name: string;
  model: "card";
  last_used_at: string;
}

export const getItemId = (item: Item) => `${item.model}-${item.id}`;

export const getItemIds = (items: Item[]): Set<string> => {
  return new Set(items.map(getItemId));
};
