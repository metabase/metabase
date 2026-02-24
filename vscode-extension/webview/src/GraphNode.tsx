import {
  Handle,
  type NodeProps,
  type Node,
  Position,
  useNodesInitialized,
} from "@xyflow/react";
import { type MouseEvent, memo, useContext } from "react";
import type { GraphViewNode } from "../../src/shared-types";
import { GraphContext } from "./GraphContext";
import type { GraphSelection } from "./GraphContext";
import { Icon } from "./icons";
import {
  getNodeTypeInfo,
  getNodeIconName,
  getDependentGroups,
  getDependencyGroupTitle,
  getDependentGroupLabel,
  type DependentGroup,
} from "./graph-utils";

export type GraphNodeType = Node<GraphViewNode>;

type GraphNodeComponentProps = NodeProps<GraphNodeType>;

export const GraphNodeComponent = memo(function GraphNodeComponent({
  data: node,
}: GraphNodeComponentProps) {
  const { selection, setSelection } = useContext(GraphContext);
  const typeInfo = getNodeTypeInfo(node);
  const iconName = getNodeIconName(node);
  const groups = getDependentGroups(node);
  const isSelected = selection !== null && selection.key === node.key && selection.groupType == null;
  const isInitialized = useNodesInitialized();

  const cardClassName = [
    "graph-node-card",
    isInitialized ? "initialized" : "",
    isSelected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClassName = [
    "graph-node-handle",
    isInitialized ? "initialized" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = () => {
    setSelection({ key: node.key, model: node.model });
  };

  return (
    <>
      <div
        className={cardClassName}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={node.name}
        aria-selected={isSelected}
      >
        <div className="graph-node-content">
          <div className="graph-node-type" style={{ color: typeInfo.color }}>
            <Icon name={iconName} size={14} />
            <span className="graph-node-type-label">{typeInfo.label}</span>
          </div>
          <div className="graph-node-name">{node.name}</div>
        </div>
        <div className="graph-node-deps">
          <div className="graph-node-deps-title">
            {getDependencyGroupTitle(node, groups)}
          </div>
          {groups.map((group) => (
            <DependencyGroupPill
              key={group.type}
              nodeKey={node.key}
              nodeModel={node.model}
              group={group}
              selection={selection}
              onSelectionChange={setSelection}
            />
          ))}
        </div>
      </div>
      {node.outgoingCount > 0 && (
        <Handle
          className={handleClassName}
          type="source"
          position={Position.Left}
          isConnectable={false}
        />
      )}
      {node.incomingCount > 0 && (
        <Handle
          className={handleClassName}
          type="target"
          position={Position.Right}
          isConnectable={false}
        />
      )}
    </>
  );
});

interface DependencyGroupPillProps {
  nodeKey: string;
  nodeModel: string;
  group: DependentGroup;
  selection: GraphSelection | null;
  onSelectionChange: (selection: GraphSelection) => void;
}

function DependencyGroupPill({
  nodeKey,
  nodeModel,
  group,
  selection,
  onSelectionChange,
}: DependencyGroupPillProps) {
  const isSelected =
    selection !== null &&
    selection.key === nodeKey &&
    selection.groupType === group.type;

  const className = [
    "graph-node-pill",
    isSelected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    onSelectionChange({
      key: nodeKey,
      model: nodeModel as GraphSelection["model"],
      groupType: group.type,
    });
  };

  return (
    <button className={className} onClick={handleClick}>
      {getDependentGroupLabel(group)}
    </button>
  );
}
