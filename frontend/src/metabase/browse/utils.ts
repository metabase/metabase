import type { SearchResult } from "metabase-types/api";

export type SortableModel = Partial<
  Pick<SearchResult, "id" | "name" | "collection">
>;

/** Sort models firstly by collection name (case insensitive), secondly by collection id, thirdly by model name (case insensitive). */
export const sortModels = (a: SortableModel, b: SortableModel) => {
  /** Format a value for sorting purposes. If the value is undefined, treat it as alphabetically last */
  const format = (value: string | number | undefined) =>
    (typeof value === "string" ? value?.toLowerCase() : value) ?? Infinity;

  // Sort first on the name of the model's parent collection, case insensitive
  const collectionNameA = format(a.collection?.name);
  const collectionNameB = format(b.collection?.name);

  if (collectionNameA < collectionNameB) {
    return -1;
  }
  if (collectionNameA > collectionNameB) {
    return 1;
  }

  // If the two models' parent collections have the same name, sort on the id of the collection
  const collectionIdA = format(a.collection?.id);
  const collectionIdB = format(b.collection?.id);

  if (collectionIdA < collectionIdB) {
    return -1;
  }
  if (collectionIdA > collectionIdB) {
    return 1;
  }

  const nameA = format(a.name?.toLowerCase());
  const nameB = format(b.name?.toLowerCase());

  // If the two collection ids are the same, sort on the names of the models
  if (nameA < nameB) {
    return -1;
  }
  if (nameA > nameB) {
    return 1;
  }

  return 0;
};
