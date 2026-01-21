import { skipToken } from "@reduxjs/toolkit/query";

import { useGetDependencyGraphQuery } from "metabase-enterprise/api";
import type { GetDependencyGraphRequest } from "metabase-types/api";

export function useGetDependenciesCount(args: GetDependencyGraphRequest) {
  const entityId = args.id != null ? Number(args.id) : null;
  const entityType = args.type;

  const { data: dependencyGraphData } = useGetDependencyGraphQuery(
    entityId != null ? { id: entityId, type: entityType } : skipToken,
  );

  if (!dependencyGraphData) {
    return { dependenciesCount: 0, dependentsCount: 0 };
  }

  const thisNode = dependencyGraphData.nodes.find(
    (node) => node.id === entityId && node.type === entityType,
  );

  const dependentsCount = Object.values(
    thisNode?.dependents_count ?? {},
  ).reduce((acc, curr) => acc + curr, 0);

  if (!dependencyGraphData?.edges) {
    return { dependenciesCount: 0, dependentsCount };
  }

  // Dependencies: edges where this entity is the SOURCE (this -> to_entity)
  // Edge direction is dependent -> dependency, so from_entity is the dependent
  // and to_entity is what it depends on (the upstream dependency)
  const dependenciesCount = dependencyGraphData.edges.filter(
    (edge) =>
      edge.from_entity_id === entityId && edge.from_entity_type === entityType,
  ).length;

  return { dependenciesCount, dependentsCount };
}
