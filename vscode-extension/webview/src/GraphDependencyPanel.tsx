import { useState, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import type { GraphViewNode, GraphViewEdge, GraphNodeModel } from "../../src/shared-types";
import { getNodeIconForModel, getGroupTypeInfo } from "./graph-utils";
import type { GraphNodeType } from "./GraphNode";

interface GraphDependencyPanelProps {
  node: GraphViewNode;
  groupType: GraphNodeModel;
  allNodes: GraphViewNode[];
  allEdges: GraphViewEdge[];
  onClose: () => void;
}

export function GraphDependencyPanel({
  node,
  groupType,
  allNodes,
  allEdges,
  onClose,
}: GraphDependencyPanelProps) {
  const [searchText, setSearchText] = useState("");
  const { fitView, getNodes } = useReactFlow<GraphNodeType>();

  const dependentNodes = useMemo(() => {
    const sourceKeys = new Set<string>();
    for (const edge of allEdges) {
      if (edge.targetKey === node.key) {
        sourceKeys.add(edge.sourceKey);
      }
    }

    return allNodes.filter((sourceNode) => {
      if (!sourceKeys.has(sourceNode.key)) return false;
      if (groupType === "question" || groupType === "model" || groupType === "metric") {
        return sourceNode.model === groupType;
      }
      return sourceNode.model === groupType;
    });
  }, [allNodes, allEdges, node.key, groupType]);

  const filteredNodes = useMemo(() => {
    if (!searchText.trim()) return dependentNodes;
    const query = searchText.toLowerCase();
    return dependentNodes.filter((dependentNode) =>
      dependentNode.name.toLowerCase().includes(query),
    );
  }, [dependentNodes, searchText]);

  const groupInfo = getGroupTypeInfo(groupType);

  const handleNodeClick = (targetKey: string) => {
    const flowNodes = getNodes();
    const targetNode = flowNodes.find((flowNode) => flowNode.id === targetKey);
    if (targetNode) {
      fitView({ nodes: [targetNode], duration: 300 });
    }
  };

  return (
    <div className="graph-panel" data-testid="graph-dependency-panel">
      <div className="graph-panel-header">
        <div className="graph-panel-header-content">
          <h3 className="graph-panel-title">
            {groupInfo.label}s that use {node.name}
          </h3>
        </div>
        <div className="graph-panel-actions">
          <button
            className="graph-panel-action-button"
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>
      {dependentNodes.length >= 5 && (
        <div className="graph-panel-search">
          <input
            type="text"
            className="graph-panel-search-input"
            placeholder="Search..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
      )}
      <div className="graph-panel-body">
        {filteredNodes.length === 0 ? (
          <div className="graph-panel-empty">No results</div>
        ) : (
          <div className="graph-panel-list">
            {filteredNodes.map((filteredNode) => (
              <button
                key={filteredNode.key}
                className="graph-panel-list-item"
                onClick={() => handleNodeClick(filteredNode.key)}
              >
                <span className="graph-panel-list-icon">
                  {getNodeIconForModel(filteredNode.model)}
                </span>
                <span className="graph-panel-list-name">{filteredNode.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
