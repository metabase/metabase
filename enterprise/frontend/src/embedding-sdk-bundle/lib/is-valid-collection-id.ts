import type { CollectionId } from "metabase-types/api";

export const isValidId = (
  collectionId: unknown,
): collectionId is CollectionId => {
  return (
    !!collectionId &&
    (typeof collectionId === "number" ||
      collectionId === "personal" ||
      collectionId === "root")
  );
};
