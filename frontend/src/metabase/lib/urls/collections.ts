import slugg from "slugg";

import { isRootPersonalCollection } from "metabase/collections/utils";
import type {
  Collection as BaseCollection,
  CollectionId,
} from "metabase-types/api";

import { appendSlug, extractEntityId } from "./utils";

export const otherUsersPersonalCollections = () => "/collection/users";

type Collection = Pick<
  BaseCollection,
  "id" | "name" | "originalName" | "personal_owner_id"
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

export function collection(collection?: Pick<Collection, "id" | "name">) {
  const isSystemCollection =
    !collection || collection.id === null || typeof collection.id === "string";

  if (isSystemCollection) {
    const id = collection && collection.id ? collection.id : "root";
    return `/collection/${id}`;
  }

  const slug = isRootPersonalCollection(collection)
    ? slugifyPersonalCollection(collection)
    : slugg(collection.name);

  return appendSlug(`/collection/${collection.id}`, slug);
}

export function isCollectionPath(path: string) {
  return /collection\/.*/.test(path);
}

export function extractCollectionId(slug = ""): CollectionId | undefined {
  if (slug === "root" || slug === "users") {
    return slug;
  }
  return extractEntityId(slug);
}
