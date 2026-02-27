import type { GraphNodeModel, GraphViewNode } from '../../src/shared-types'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getGroupTypeInfo, getIconNameForModel } from './graph-utils'
import { GraphContext } from './GraphContext'
import { Icon } from './icons'

interface GraphFilterDropdownProps {
  nodes: GraphViewNode[]
}

const MODEL_ORDER: GraphNodeModel[] = [
  'table',
  'model',
  'question',
  'metric',
  'measure',
  'segment',
  'dashboard',
  'transform',
  'snippet',
  'document',
  'collection',
  'database',
  'action',
  'field',
]

export function GraphFilterDropdown({ nodes }: GraphFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { visibleModels, setVisibleModels } = useContext(GraphContext)

  const availableModels = useMemo(() => {
    const modelSet = new Set<GraphNodeModel>()
    for (const node of nodes) {
      modelSet.add(node.model)
    }
    return MODEL_ORDER.filter(model => modelSet.has(model))
  }, [nodes])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current
        && !dropdownRef.current.contains(event.target as HTMLElement)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () =>
        document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleToggleModel = (model: GraphNodeModel) => {
    const newVisibleModels = new Set(visibleModels)
    if (newVisibleModels.has(model)) {
      newVisibleModels.delete(model)
    }
    else {
      newVisibleModels.add(model)
    }
    setVisibleModels(newVisibleModels)
  }

  const handleShowAll = () => {
    setVisibleModels(new Set())
  }

  const hasFilters = visibleModels.size > 0

  return (
    <div className="graph-filter-container" ref={dropdownRef}>
      <button
        className={`graph-filter-button ${hasFilters ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Filter by type"
      >
        <Icon name="filter" size={16} />
        {hasFilters && (
          <span className="graph-filter-badge">{visibleModels.size}</span>
        )}
      </button>
      {isOpen && (
        <div className="graph-filter-dropdown">
          <div className="graph-filter-header">
            <span className="graph-filter-title">Filter by type</span>
            {hasFilters && (
              <button
                className="graph-filter-clear"
                onClick={handleShowAll}
              >
                Show all
              </button>
            )}
          </div>
          <div className="graph-filter-list">
            {availableModels.map((model) => {
              const isVisible = visibleModels.has(model)
              const info = getGroupTypeInfo(model)
              const iconName = getIconNameForModel(model)
              return (
                <label
                  key={model}
                  className="graph-filter-item"
                >
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => handleToggleModel(model)}
                  />
                  <Icon name={iconName} size={14} style={{ color: info.color }} />
                  <span>{info.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
