import { useMemo } from "react";
import { t } from "ttag";

import type {
  CollectionItemData,
  TreeItem,
} from "metabase/data-studio/common/types";
import { createEmptyStateItem } from "metabase/data-studio/common/utils";
import { useListSeedsQuery } from "metabase-enterprise/api";

const SEEDS_SECTION_ID = "library-seeds-section";

// Seeds have no real Library collection: they're git-authored and materialized on pull,
// so they render as a synthetic, read-only top-level section peer to Data / Metrics /
// Snippets, sourced from the seeds API.
export function useBuildSeedsTree(): {
  tree: TreeItem[];
  isLoading: boolean;
  seedTableIds: Set<number>;
} {
  const { data: seeds = [], isLoading } = useListSeedsQuery();

  return useMemo(() => {
    const seedTableIds = new Set(
      seeds
        .map((seed) => seed.table_id)
        .filter((id): id is number => id != null),
    );

    if (isLoading) {
      return { tree: [], isLoading: true, seedTableIds };
    }

    const seedRows = seeds.map(
      (seed): TreeItem => ({
        id: `seed:${seed.id}`,
        name: seed.name,
        icon: "table2",
        model: "seed",
        updatedAt: seed.updated_at,
        data: {
          model: "seed",
          id: seed.id,
          name: seed.name,
          tableId: seed.table_id,
        },
      }),
    );

    // Synthetic section header, not a real collection: only id/name/model are read
    // (it renders as a section like Data/Metrics and has no action menu).
    const sectionData: CollectionItemData = {
      model: "collection",
      name: t`Seeds`,
    };

    const sectionNode: TreeItem = {
      id: SEEDS_SECTION_ID,
      name: t`Seeds`,
      icon: "table2",
      model: "collection",
      data: sectionData,
      children:
        seedRows.length > 0
          ? seedRows
          : [createEmptyStateItem("seeds", undefined, true)],
    };

    return { tree: [sectionNode], isLoading: false, seedTableIds };
  }, [seeds, isLoading]);
}
