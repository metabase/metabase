import { useMemo } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box } from "metabase/ui";
import { useGetWorkspaceGraphQuery } from "metabase-enterprise/api";
import { DependencyGraph as DependencyGraphComponent } from "metabase-enterprise/dependencies/components/DependencyGraph/DependencyGraph";
import { WorkspaceGraphNode } from "metabase-enterprise/dependencies/components/DependencyGraph/GraphNode/WorkspaceGraphNode";
import type {
  DependencyEntry,
  WorkspaceDependencyGraph,
  WorkspaceGraphDependencyEdge,
  WorkspaceGraphDependencyNode,
  WorkspaceGraphResponse,
  WorkspaceGraphTableNode,
  WorkspaceGraphTransformNode,
  WorkspaceId,
} from "metabase-types/api";

type GraphTabProps = {
  workspaceId: WorkspaceId;
};

const NODE_TYPES = {
  node: WorkspaceGraphNode,
};

export function GraphTab({ workspaceId }: GraphTabProps) {
  const {
    data: graphData,
    isFetching,
    error,
  } = useGetWorkspaceGraphQuery(workspaceId);

  const dependencyGraph = useDependencyGraph(graphData, workspaceId);

  // Create a dummy entry to initialize GraphComponent correctly (not empty).
  const dummyEntry: DependencyEntry = {
    id: workspaceId,
    type: "workspace-transform",
  };

  if (isFetching || error) {
    return <LoadingAndErrorWrapper error={error} loading={isFetching} />;
  }

  const getGraphUrl = () => `/api/ee/workspace/${workspaceId}/graph`;

  return (
    <Box h="100%" w="100%">
      <DependencyGraphComponent
        entry={dummyEntry}
        graph={dependencyGraph}
        getGraphUrl={getGraphUrl}
        withEntryPicker={false}
        nodeTypes={NODE_TYPES}
        openLinksInNewTab={false}
      />
    </Box>
  );
}

function useDependencyGraph(
  graphData: WorkspaceGraphResponse | undefined,
  workspaceId: WorkspaceId,
): WorkspaceDependencyGraph | undefined {
  return useMemo(() => {
    if (!graphData) {
      return undefined;
    }

    // Transform workspace graph data to match WorkspaceDependencyGraph format
    // Data Studio graph doesn't have a concept of input and output tables,
    // so we need to transform the data to match the expected format.
    const dependencyNodes = [...graphData.nodes].reduce<
      WorkspaceGraphDependencyNode[]
    >((acc, node) => {
      if (node.type === "input-table") {
        const tableNode: WorkspaceGraphTableNode = {
          id: node.id,
          type: "table",
          data: {
            name: node.data?.table || t`Table ${node.id}`,
            display_name: node.data?.table || t`Table ${node.id}`,
            description: null,
            db_id: node.data?.db,
            schema: node.data?.schema,
            fields: [],
            table_id: node.data?.id,
          },
          dependents_count: node.dependents_count,
        };
        acc.push(tableNode);
      } else if (node.type === "workspace-transform") {
        const transformNode: WorkspaceGraphTransformNode = {
          id: node.id,
          type: "workspace-transform",
          data: {
            name: node.data?.name || `Transform ${node.id}`,
            workspace_id: workspaceId,
            ref_id: node.data?.ref_id,
            target: node.data?.target,
          },
          dependents_count: node.dependents_count,
        };
        acc.push(transformNode);

        // Create target table node if target information is available
        if (node.data?.target) {
          const targetTableNode: WorkspaceGraphTableNode = {
            id: `target-${node.id}`,
            type: "table",
            data: {
              name: node.data.target.table || t`Target table ${node.id}`,
              display_name:
                node.data.target.table || t`Target table ${node.id}`,
              description: null,
              db_id: node.data.target.db,
              schema: node.data.target.schema,
              fields: [],
              table_id: node.data.target.table_id ?? undefined,
            },
            dependents_count: {},
          };
          acc.push(targetTableNode);
        }
      }
      return acc;
    }, []);

    // Transform edges to match WorkspaceGraphDependencyEdge format
    const dependencyEdges: WorkspaceGraphDependencyEdge[] = graphData.edges.map(
      (edge) => {
        const fromEntityType: WorkspaceGraphDependencyEdge["from_entity_type"] =
          edge.from_entity_type === "workspace-transform"
            ? "workspace-transform"
            : "table";
        const toEntityType: WorkspaceGraphDependencyEdge["to_entity_type"] =
          edge.to_entity_type === "workspace-transform"
            ? "workspace-transform"
            : "table";

        return {
          from_entity_id: edge.from_entity_id,
          from_entity_type: fromEntityType,
          to_entity_id: edge.to_entity_id,
          to_entity_type: toEntityType,
        };
      },
    );

    // Add edges from workspace-transforms to their target tables
    graphData.nodes.forEach((node) => {
      if (node.type === "workspace-transform" && node.data?.target) {
        const targetEdge: WorkspaceGraphDependencyEdge = {
          from_entity_id: `target-${node.id}`,
          from_entity_type: "table",
          to_entity_id: node.id,
          to_entity_type: "workspace-transform",
        };
        dependencyEdges.push(targetEdge);
      }
    });

    return {
      nodes: dependencyNodes,
      edges: dependencyEdges,
    };
  }, [graphData, workspaceId]);
}
