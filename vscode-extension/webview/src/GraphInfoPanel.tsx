import type { GraphViewNode } from "../../src/shared-types";
import { Icon } from "./icons";
import { getNodeIconName, getNodeTypeInfo, getFieldIconName } from "./graph-utils";
import { vscode } from "./vscode";

interface GraphInfoPanelProps {
  node: GraphViewNode;
  onClose: () => void;
}

export function GraphInfoPanel({ node, onClose }: GraphInfoPanelProps) {
  const iconName = getNodeIconName(node);
  const typeInfo = getNodeTypeInfo(node);

  const handleOpenFile = () => {
    vscode.postMessage({ type: "openFile", filePath: node.filePath });
  };

  return (
    <div className="graph-panel" data-testid="graph-info-panel">
      <div className="graph-panel-header">
        <div
          className="graph-panel-icon-badge"
          style={{ color: "var(--graph-color-brand)" }}
        >
          <Icon name={iconName} size={20} />
        </div>
        <div className="graph-panel-header-content">
          <h3 className="graph-panel-title">{node.name}</h3>
          <div className="graph-panel-subtitle" style={{ color: typeInfo.color }}>
            {typeInfo.label}
          </div>
        </div>
        <div className="graph-panel-actions">
          {node.filePath && (
            <button
              className="graph-panel-action-button"
              onClick={handleOpenFile}
              title="Open YAML"
            >
              <Icon name="folder" size={16} />
            </button>
          )}
          <button
            className="graph-panel-action-button"
            onClick={onClose}
            title="Close"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
      <div className="graph-panel-body">
        <DescriptionSection description={node.description} />
        {node.createdAt && <CreatedAtSection createdAt={node.createdAt} />}
        {node.fields && node.fields.length > 0 && (
          <FieldsSection fields={node.fields} />
        )}
      </div>
    </div>
  );
}

function DescriptionSection({
  description,
}: {
  description: string | null;
}) {
  return (
    <div
      className="graph-panel-section"
      style={{
        color: description
          ? "var(--graph-text-primary)"
          : "var(--graph-text-secondary)",
      }}
    >
      {description || "No description"}
    </div>
  );
}

function CreatedAtSection({ createdAt }: { createdAt: string }) {
  let formatted = createdAt;
  try {
    formatted = new Date(createdAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    // keep raw string
  }

  return (
    <div className="graph-panel-section">
      <span className="graph-panel-section-label">Created</span>
      <span>{formatted}</span>
    </div>
  );
}

function FieldsSection({
  fields,
}: {
  fields: Array<{ name: string; semanticType: string | null }>;
}) {
  return (
    <div className="graph-panel-section">
      <h4 className="graph-panel-section-title">
        {fields.length} field{fields.length !== 1 ? "s" : ""}
      </h4>
      <div className="graph-panel-fields-list">
        {fields.map((field, index) => (
          <div key={index} className="graph-panel-field-item">
            <span className="graph-panel-field-icon">
              <Icon
                name={getFieldIconName(field.semanticType)}
                size={14}
              />
            </span>
            <span className="graph-panel-field-name">{field.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
