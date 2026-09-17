import ErrorBoundary from "metabase/ErrorBoundary";
import type { CollectionTreeItem } from "metabase/common/collections/utils";

import { NavbarLibrarySection } from "../NavbarLibrarySection";

import { NavbarOfficialSection } from "./NavbarOfficialSection";
import { useOfficialNavItems } from "./use-official-nav-items";

type OfficialNavProps = {
  collections: CollectionTreeItem[];
  selectedId?: string | number;
  onItemSelect: () => void;
};

/**
 * The curated half of the rail: the Library and every official collection, with the items that
 * live in them.
 */
export function OfficialNav({
  collections,
  selectedId,
  onItemSelect,
}: OfficialNavProps) {
  const { itemsByCollectionId, officialCollectionIds } =
    useOfficialNavItems(collections);

  return (
    <>
      <ErrorBoundary>
        <NavbarLibrarySection
          collections={collections}
          itemsByCollectionId={itemsByCollectionId}
          selectedId={selectedId}
          onItemSelect={onItemSelect}
        />
      </ErrorBoundary>
      <ErrorBoundary>
        <NavbarOfficialSection
          collections={collections}
          officialCollectionIds={officialCollectionIds}
          itemsByCollectionId={itemsByCollectionId}
          selectedId={selectedId}
          onItemSelect={onItemSelect}
        />
      </ErrorBoundary>
    </>
  );
}
