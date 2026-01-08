import { useMemo } from "react";
import { t } from "ttag";

import { Loader } from "metabase/ui";
import { useGetWorkspaceGraphQuery } from "metabase-enterprise/api";
import { DependencyGraph as DependencyGraphComponent } from "metabase-enterprise/dependencies/components/DependencyGraph/DependencyGraph";
import { WorkspaceGraphNode } from "metabase-enterprise/dependencies/components/DependencyGraph/GraphNode/WorkspaceGraphNode";
import type {
  DependencyEdge,
  DependencyEntry,
  DependencyGraph,
  DependencyNode,
  TableDependencyNode,
  WorkspaceGraphResponse,
  WorkspaceId,
  WorkspaceTransformDependencyNode,
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
  console.log('dependencyGraph WS', dependencyGraph);

  // Create a dummy entry to prevent DependencyGraph from clearing the graph
  // The workspace graph shows the entire workspace without filtering
  const dummyEntry: DependencyEntry = {
    id: workspaceId.toString(), // Convert number to string
    type: "transform", // Using transform as the type since it's a valid dependency type
  };

  if (isFetching) {
    return (
      <div
        style={{ display: "flex", justifyContent: "center", padding: "4rem" }}
      >
        <Loader />
      </div>
    );
  }

  if (error || !graphData) {
    return (
      <div
        style={{ display: "flex", justifyContent: "center", padding: "4rem" }}
      >
        {t`Failed to load dependency graph`}
      </div>
    );
  }

  const getGraphUrl = () => `/api/ee/workspace/${workspaceId}/graph`;

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <DependencyGraphComponent
        entry={dummyEntry}
        graph={dependencyGraph}
        isFetching={isFetching}
        error={error}
        getGraphUrl={getGraphUrl}
        withEntryPicker={false}
        nodeTypes={NODE_TYPES}
      />
    </div>
  );
}

function useDependencyGraph(
  graphData: WorkspaceGraphResponse | undefined,
  workspaceId: WorkspaceId,
): DependencyGraph | undefined {
  return useMemo(() => {
    if (!graphData) {
      return undefined;
    }

    // Transform workspace graph data to match DependencyGraph format
    // Data Studio graph doesn't have a concept of input and output tables,
    // so we need to transform the data to match the expected format.
    const dependencyNodes = [...graphData.nodes].reduce<DependencyNode[]>(
      (acc, node) => {
        if (node.type === "input-table") {
          const tableNode: TableDependencyNode = {
            id: node.id,
            type: "table",
            data: {
              name: (node.data?.table) || `Table ${node.id}`,
              display_name: (node.data?.table) || `Table ${node.id}`,
              description: null,
              db_id: (node.data?.db),
              schema: (node.data?.schema),
              fields: [],
              table_id: node.data?.id,
            },
            dependents_count: node.dependents_count,
          };
          acc.push(tableNode);
        } else if (node.type === "workspace-transform") {
          const transformNode: WorkspaceTransformDependencyNode = {
            id: node.id,
            type: "workspace-transform",
            data: {
              name: (node.data?.name as string) || `Transform ${node.id}`,
              description: null,
              workspaceId: workspaceId,
              ref_id: node.data?.ref_id as string | undefined,
            },
            dependents_count: node.dependents_count,
          };
          acc.push(transformNode);

          // Create target table node if target information is available
          if (node.data?.target) {
            const targetTableNode: TableDependencyNode = {
              id: `target-${node.id}`, // Use a unique ID for the target table
              type: "table",
              data: {
                name: node.data.target.table || `Target Table ${node.id}`,
                display_name: node.data.target.table || `Target Table ${node.id}`,
                description: null,
                db_id: node.data.target.db,
                schema: node.data.target.schema,
                fields: [],
                table_id: node.data.target.id,
              },
              dependents_count: {}, // Target tables start with no dependents
            };
            acc.push(targetTableNode);
          }
        }
        return acc;
      },
      []
    );

    // Transform edges to match DependencyEdge format
    const dependencyEdges: DependencyEdge[] = [...graphData.edges].reverse().map((edge) => ({
      from_entity_id: edge.from_entity_id, // Use original ID directly
      from_entity_type:
        edge.from_entity_type === "input-table"
          ? "table"
          : (edge.from_entity_type as "transform" | "workspace-transform"),
      to_entity_id: edge.to_entity_id, // Use original ID directly
      to_entity_type:
        edge.to_entity_type === "workspace-transform"
          ? "workspace-transform"
          : (edge.to_entity_type as "table" | "transform"),
    }));

    // Add edges from workspace-transforms to their target tables
    graphData.nodes.forEach((node) => {
      if (node.type === "workspace-transform" && node.data?.target) {
        const targetEdge: DependencyEdge = {
          from_entity_id: node.id,
          from_entity_type: "workspace-transform",
          to_entity_id: `target-${node.id}`, // Use the same ID as the target table node
          to_entity_type: "table",
        };
        dependencyEdges.push(targetEdge);
      }
    });

    // Combine into DependencyGraph format
    return {
      nodes: dependencyNodes,
      edges: dependencyEdges,
    };
  }, [graphData, workspaceId]);
}
