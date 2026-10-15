import type { ReactNode } from "react";
import { c, t } from "ttag";

import { NotFound } from "metabase/common/components/ErrorPages";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Center } from "metabase/ui";
import type { CollectionEssentials } from "metabase-types/api";

import type { LibraryItem, LibraryItemModelOf } from "../../types";
import { getLibraryItemSection } from "../../utils";

import { useLibraryItemPath } from "./use-library-item-path";
import { getLibraryItemPageStatus } from "./utils";

type LibraryItemPageStateProps<Item extends LibraryItem> = {
  model: LibraryItemModelOf<Item>;
  item: Item | undefined;
  isLoading: boolean;
  error: unknown;
  /** Where the item opens outside Data Studio, offered when it is not in the Library */
  getItemUrl: (item: Item) => string;
  /** The page, once the item and the folders leading to it are known */
  children: (item: Item, folders: CollectionEssentials[]) => ReactNode;
};

/**
 * Decides what a Library item page shows while the item and its collection
 * path load: a delayed loader, the error, a not-found state with a link back to
 * the section, a notice for an item that lives outside the Library, or the page.
 */
export function LibraryItemPageState<Item extends LibraryItem>({
  model,
  item,
  isLoading,
  error,
  getItemUrl,
  children,
}: LibraryItemPageStateProps<Item>) {
  const section = getLibraryItemSection(model);
  const path = useLibraryItemPath(
    item == null ? undefined : (item.collection?.id ?? null),
  );
  const status = getLibraryItemPageStatus({
    item,
    isLoading,
    error,
    path: path.path,
    isLoadingPath: path.isLoading,
    pathError: path.error,
    sectionType: section.type,
  });

  switch (status.type) {
    case "loading":
      return (
        <Center h="100%">
          <DelayedLoadingAndErrorWrapper loading error={undefined} />
        </Center>
      );
    case "error":
      return (
        <Center h="100%">
          <DelayedLoadingAndErrorWrapper loading={false} error={status.error} />
        </Center>
      );
    case "not-found": {
      const sectionName = section.getName();
      return (
        <NotFound
          title={section.notFoundTitle}
          message={t`It may have been permanently deleted.`}
          action={{
            label: c(
              "{0} is the name of a Data Studio Library section, e.g. Documents",
            ).t`Go to ${sectionName}`,
            link: section.getUrl(),
          }}
        />
      );
    }
    case "outside-library":
      return (
        <NotFound
          title={section.outsideLibraryTitle}
          message={c("{0} is the name of the collection the item is saved in")
            .t`It's saved in ${status.locationName}.`}
          action={{ label: t`Open`, link: getItemUrl(status.item) }}
        />
      );
    case "ready":
      return <>{children(status.item, status.folders)}</>;
  }
}
