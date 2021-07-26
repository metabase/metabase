import { ROOT_COLLECTION } from "metabase/entities/collections";

export const getCollectionId = collectionIdParameter =>
  collectionIdParameter === ROOT_COLLECTION.id
    ? collectionIdParameter
    : parseInt(collectionIdParameter);
