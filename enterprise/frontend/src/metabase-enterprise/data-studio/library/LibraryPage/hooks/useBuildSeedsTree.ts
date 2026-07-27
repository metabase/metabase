import { useMemo } from "react";
import { t } from "ttag";

import type {
  CollectionData,
  TreeItem,
} from "metabase/data-studio/common/types";
import { createEmptyStateItem } from "metabase/data-studio/common/utils";
import { useSelector } from "metabase/redux";
import { useListSeedsQuery } from "metabase-enterprise/api";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";

const SEEDS_SECTION_ID = "library-seeds-section";

// Seeds have no real Library collection yet, so they're rendered as a synthetic
// top-level section peer to Data / Metrics / Snippets, sourced from the seeds API.
export function useBuildSeedsTree(): {
  tree: TreeItem[];
  isLoading: boolean;
  seedTableIds: Set<number>;
} {
  const { data: seeds = [], isLoading } = useListSeedsQuery();
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

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

    const sectionNode: TreeItem = {
      id: SEEDS_SECTION_ID,
      name: t`Seeds`,
      icon: "table2",
      model: "collection",
      // Synthetic section header, not a real collection: rendered as a section
      // like Data/Metrics, and its action menu resolves to nothing (not a
      // library sub-collection type), so only id/name/model are ever read.
      data: {
        id: SEEDS_SECTION_ID,
        name: t`Seeds`,
        model: "collection",
      } as unknown as CollectionData,
      children:
        seedRows.length > 0
          ? seedRows
          : [createEmptyStateItem("seeds", undefined, isRemoteSyncReadOnly)],
    };

    return { tree: [sectionNode], isLoading: false, seedTableIds };
  }, [seeds, isLoading, isRemoteSyncReadOnly]);
}
