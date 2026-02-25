import type { GraphNodeModel } from '../../src/shared-types'
import { createContext } from 'react'

export interface GraphSelection {
  key: string
  model: GraphNodeModel
  groupType?: GraphNodeModel
}

export interface IsolatedPath {
  targetKey: string
  nodeKeys: Set<string>
  edgeIds: Set<string>
}

export interface GraphContextType {
  selection: GraphSelection | null
  setSelection: (selection: GraphSelection | null) => void
  isolatedPath: IsolatedPath | null
  setIsolatedPath: (path: IsolatedPath | null) => void
  visibleModels: Set<GraphNodeModel>
  setVisibleModels: (models: Set<GraphNodeModel>) => void
}

export const GraphContext = createContext<GraphContextType>({
  selection: null,
  setSelection: () => undefined,
  isolatedPath: null,
  setIsolatedPath: () => undefined,
  visibleModels: new Set(),
  setVisibleModels: () => undefined,
})
