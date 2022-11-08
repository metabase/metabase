import slugg from "slugg";

import {
  Collection as BaseCollection,
  CollectionId,
  RegularCollectionId,
} from "metabase-types/api";

import { dataApp } from "./dataApps";
import { appendSlug, extractEntityId } from "./utils";

export const newCollection = (collectionId: CollectionId) =>
  `/collection/${collectionId}/new_collection`;

export const otherUsersPersonalCollections = () => "/collection/users";

type Collection = Pick<
  BaseCollection,
  "id" | "name" | "originalName" | "personal_owner_id" | "app_id"
>;

function slugifyPersonalCollection(collection: Collection) {
  // Current user's personal collection name is replaced with "Your personal collection"
  // `originalName` keeps the original name like "John Doe's Personal Collection"
  const name = collection.originalName || collection.name;

  // Will keep single quote characters,
  // so "John's" can be converted to `john-s` instead of `johns`
  let slug = slugg(name, {
    toStrip: /["”“]/g,
  });

  // If can't build a slug out of user's name (e.g. if it contains only emojis)
  // removes the "s-" part of a slug
  if (slug === "s-personal-collection") {
    slug = slug.replace("s-", "");
  }

  return slug;
}

export function collection(collection?: Collection) {
  const isSystemCollection =
    !collection || collection.id === null || typeof collection.id === "string";

  if (isSystemCollection) {
    const id = collection && collection.id ? collection.id : "root";
    return `/collection/${id}`;
  }

  // Data app is another kind of Metabase entity build on top of a collection
  // Each app has a 1:1 relation with a collection
  // (this collection isn't shown in Metabase though, the app serves as a "wrapper")
  // When building collection URLs we should take `app_id` into account
  if (typeof collection.app_id === "number") {
    return dataApp(
      {
        id: collection.id as RegularCollectionId,
        app_id: collection.app_id,
        collection: collection as BaseCollection,
      },
      { mode: "preview" },
    );
  }

  const isPersonalCollection = typeof collection.personal_owner_id === "number";
  const slug = isPersonalCollection
    ? slugifyPersonalCollection(collection)
    : slugg(collection.name);

  return appendSlug(`/collection/${collection.id}`, slug);
}

export function isCollectionPath(path: string) {
  return /collection\/.*/.test(path);
}

export function extractCollectionId(slug = "") {
  if (slug === "root" || slug === "users") {
    return slug;
  }
  return extractEntityId(slug);
}
