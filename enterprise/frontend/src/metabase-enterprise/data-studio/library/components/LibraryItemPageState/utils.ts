import { isResourceNotFoundError } from "metabase/utils/errors";
import type {
  CollectionEssentials,
  CollectionId,
  LibrarySubCollectionType,
} from "metabase-types/api";

import { getLibrarySectionFolders } from "../../utils";

type LibraryItemPageStatus<Item> =
  | { type: "loading" }
  | { type: "error"; error: unknown }
  | { type: "not-found" }
  | { type: "outside-library"; item: Item; locationName: string }
  | { type: "ready"; item: Item; folders: CollectionEssentials[] };

type GetLibraryItemPageStatusOpts<Item> = {
  item: Item | undefined;
  isLoading: boolean;
  error: unknown;
  /** The item's collection path, root first, once it is loaded */
  path: CollectionEssentials[] | undefined;
  isLoadingPath: boolean;
  pathError: unknown;
  sectionType: LibrarySubCollectionType;
};

/**
 * What a Library item page shows. An item the API does not know, or a route
 * with no usable id, is not found; an item whose collection path does not pass
 * through the section is outside the Library.
 */
export function getLibraryItemPageStatus<Item>({
  item,
  isLoading,
  error,
  path,
  isLoadingPath,
  pathError,
  sectionType,
}: GetLibraryItemPageStatusOpts<Item>): LibraryItemPageStatus<Item> {
  if (isLoading) {
    return { type: "loading" };
  }
  if (error != null && !isResourceNotFoundError(error)) {
    return { type: "error", error };
  }
  if (item == null) {
    return { type: "not-found" };
  }
  if (isLoadingPath || (path == null && pathError == null)) {
    return { type: "loading" };
  }
  if (path == null) {
    return { type: "error", error: pathError };
  }

  const folders = getLibrarySectionFolders(path, sectionType);
  if (folders == null) {
    return {
      type: "outside-library",
      item,
      locationName: getLocationName(path),
    };
  }
  return { type: "ready", item, folders };
}

function getLocationName(path: CollectionEssentials[]): string {
  return path[path.length - 1]?.name ?? "";
}

/** The id of the collection holding `location`, or `undefined` at the root */
export function getParentCollectionId(
  location: string | null,
): CollectionId | undefined {
  const ids = (location ?? "")
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => Number(segment));
  return ids[ids.length - 1];
}
