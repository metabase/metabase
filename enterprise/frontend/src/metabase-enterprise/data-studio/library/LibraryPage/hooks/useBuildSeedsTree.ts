import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import type {
  CollectionItemData,
  SeedData,
  TreeItem,
} from "metabase/data-studio/common/types";
import { createEmptyStateItem } from "metabase/data-studio/common/utils";
import { useListSeedsQuery } from "metabase-enterprise/api";
import type { Seed } from "metabase-enterprise/api/seed";
import type { IconName } from "metabase-types/api";

const SEEDS_SECTION_ID = "library-seeds-section";
const UNRESOLVED_GROUP_ID = "seeds-unresolved-db";

// A synthetic, non-navigable folder (the section, a database, or a schema). Only its id/name/model
// are read; model "collection" is what makes the tree treat it as an expandable group.
function groupNode(
  id: string,
  name: string,
  icon: IconName,
  children: TreeItem[],
): TreeItem {
  const data: CollectionItemData = { model: "collection", name };
  return { id, name, icon, model: "collection", data, children };
}

function seedNode(seed: Seed): TreeItem {
  const data: SeedData = {
    model: "seed",
    id: seed.id,
    name: seed.name,
    origin: seed.origin,
    tableId: seed.table_id,
    syncError: seed.sync_error,
  };
  return {
    id: `seed:${seed.id}`,
    name: seed.name,
    icon: seed.sync_error != null ? "warning" : "table2",
    model: "seed",
    updatedAt: seed.updated_at,
    data,
  };
}

// Group db -> schema -> seed. Seeds arrive name-sorted, so grouping preserves that order.
// Seeds whose sidecar names a db that doesn't resolve on this instance have no db to sit under,
// so they collect in their own "couldn't resolve" folder instead of the tree.
function buildDatabaseGroups(seeds: Seed[]): TreeItem[] {
  const [unresolved, resolved] = _.partition(
    seeds,
    (seed) => seed.database_name == null,
  );

  const dbGroups = Object.entries(_.groupBy(resolved, "database_name"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dbName, dbSeeds]) => {
      const schemaGroups = Object.entries(
        _.groupBy(dbSeeds, (seed) => seed.schema_name ?? ""),
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([schema, schemaSeeds]) =>
          groupNode(
            `seeds-db:${dbName}:schema:${schema}`,
            schema || t`Default schema`,
            "folder",
            schemaSeeds.map(seedNode),
          ),
        );
      return groupNode(`seeds-db:${dbName}`, dbName, "database", schemaGroups);
    });

  if (unresolved.length > 0) {
    dbGroups.push(
      groupNode(
        UNRESOLVED_GROUP_ID,
        t`Couldn't resolve database`,
        "warning",
        unresolved.map(seedNode),
      ),
    );
  }
  return dbGroups;
}

// Seeds have no real Library collection: they're git-authored and materialized on pull, so they
// render as a synthetic, read-only top-level section (peer to Data / Metrics / Snippets), with the
// seeds grouped underneath by the database and schema they were materialized into.
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

    const groups = buildDatabaseGroups(seeds);
    const sectionNode = groupNode(
      SEEDS_SECTION_ID,
      t`Seeds`,
      "table2",
      groups.length > 0
        ? groups
        : [createEmptyStateItem("seeds", undefined, true)],
    );

    return { tree: [sectionNode], isLoading: false, seedTableIds };
  }, [seeds, isLoading]);
}
