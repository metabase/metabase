import type { Table } from "metabase-types/api";

import { type Hierarchy, useHierarchies } from "./hierarchies";
import { getHierarchyProposals, getProposalHierarchy } from "./inference";

/** A table's hierarchy, and why sync made it while no one has confirmed it */
export type TableHierarchy = {
  hierarchy: Hierarchy;
  /** Set while it's sync's and unconfirmed: what sync found */
  inference: string | null;
};

/**
 * PROTOTYPE: mocked. A table's hierarchies as doc 06 has them: the saved ones,
 * then the ones sync makes on its own. Saving or confirming a sync hierarchy
 * stores it; deleting one keeps sync from making it again.
 */
export function useTableHierarchies(table: Table | undefined) {
  const {
    getHierarchies,
    getResolvedProposalKeys,
    saveHierarchy,
    deleteHierarchy,
    resolveProposal,
  } = useHierarchies();
  const stored = table ? getHierarchies(table) : [];
  const inferred = table
    ? getHierarchyProposals(
        table,
        table.fields ?? [],
        stored,
        getResolvedProposalKeys(table),
      )
    : [];
  const items: TableHierarchy[] = [
    ...stored.map((hierarchy) => ({ hierarchy, inference: null })),
    ...inferred.map((proposal) => ({
      hierarchy: getProposalHierarchy(proposal),
      inference: proposal.signal,
    })),
  ];

  const save = (hierarchy: Hierarchy) => {
    if (table) {
      saveHierarchy(table, hierarchy);
    }
  };

  const remove = (hierarchy: Hierarchy) => {
    if (!table) {
      return;
    }
    deleteHierarchy(table, hierarchy.id);
    if (hierarchy.syncKey != null) {
      resolveProposal(table, hierarchy.syncKey);
    }
  };

  return {
    items,
    hierarchies: items.map(({ hierarchy }) => hierarchy),
    save,
    remove,
  };
}
