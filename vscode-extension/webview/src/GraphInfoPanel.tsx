import type { GraphViewEdge, GraphViewNode } from '../../src/shared-types'

import { useContext } from 'react'

import { computeIsolatedPath, getFieldIconName, getNodeIconName, getNodeTypeInfo } from './graph-utils'
import { GraphContext } from './GraphContext'
import { Icon } from './icons'
import { vscode } from './vscode'

interface GraphInfoPanelProps {
  node: GraphViewNode
  allEdges: GraphViewEdge[]
  onClose: () => void
}

export function GraphInfoPanel({ node, allEdges, onClose }: GraphInfoPanelProps) {
  const { isolatedPath, setIsolatedPath } = useContext(GraphContext)
  const iconName = getNodeIconName(node)
  const typeInfo = getNodeTypeInfo(node)
  const isIsolated = isolatedPath?.targetKey === node.key

  const handleOpenFile = () => {
    vscode.postMessage({ type: 'openFile', filePath: node.filePath })
  }

  const handleIsolatePath = () => {
    if (isIsolated) {
      setIsolatedPath(null)
    }
    else {
      const path = computeIsolatedPath(node.key, allEdges)
      setIsolatedPath(path)
    }
  }

  return (
    <div className="graph-panel" data-testid="graph-info-panel">
      <div className="graph-panel-header">
        <div
          className="graph-panel-icon-badge"
          style={{ color: 'var(--graph-color-brand)' }}
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
          <button
            className={`graph-panel-action-button ${isIsolated ? 'active' : ''}`}
            onClick={handleIsolatePath}
            title={isIsolated ? 'Show all nodes' : 'Isolate path to this node'}
          >
            <Icon name="focus" size={16} />
          </button>
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
  )
}

function DescriptionSection({
  description,
}: {
  description: string | null
}) {
  return (
    <div
      className="graph-panel-section"
      style={{
        color: description
          ? 'var(--graph-text-primary)'
          : 'var(--graph-text-secondary)',
      }}
    >
      {description || 'No description'}
    </div>
  )
}

function CreatedAtSection({ createdAt }: { createdAt: string }) {
  let formatted = createdAt
  try {
    formatted = new Date(createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }
  catch {
    // keep raw string
  }

  return (
    <div className="graph-panel-section">
      <span className="graph-panel-section-label">Created</span>
      <span>{formatted}</span>
    </div>
  )
}

function FieldsSection({
  fields,
}: {
  fields: Array<{ name: string, semanticType: string | null }>
}) {
  return (
    <div className="graph-panel-section">
      <h4 className="graph-panel-section-title">
        {fields.length}
        {' '}
        field
        {fields.length !== 1 ? 's' : ''}
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
  )
}
