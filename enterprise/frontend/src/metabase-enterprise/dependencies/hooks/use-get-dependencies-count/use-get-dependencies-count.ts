import { skipToken } from "@reduxjs/toolkit/query";

import { useGetDependencyGraphQuery } from "metabase-enterprise/api";
import type { GetDependencyGraphRequest } from "metabase-types/api";

export function useGetDependenciesCount(args: GetDependencyGraphRequest) {
  const { data: dependencyGraphData } = useGetDependencyGraphQuery(
    args.id != null ? { id: Number(args.id), type: args.type } : skipToken,
  );

  if (!dependencyGraphData) {
    return { dependenciesCount: 0, dependentsCount: 0 };
  }

  const thisTable = dependencyGraphData.nodes.find(
    (node) => node.id === args.id,
  );

  const dependentsCount = Object.values(
    thisTable?.dependents_count ?? {},
  ).reduce((acc, curr) => acc + curr, 0);

  if (!dependencyGraphData?.edges) {
    return { dependenciesCount: 0, dependentsCount };
  }

  // Dependencies: edges pointing TO this table (things this table depends on)
  const dependencies = dependencyGraphData.edges.filter(
    (edge) =>
      edge.to_entity_id === args.id && edge.to_entity_type === args.type,
  ).length;

  return { dependenciesCount: dependencies, dependentsCount };
}
