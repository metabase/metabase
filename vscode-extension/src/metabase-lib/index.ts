export type {
  TableRef,
  FieldRef,
  DatabaseNode,
  SchemaNode,
  TableNode,
  FieldNode,
  MeasureNode,
  SegmentNode,
  CollectionNode,
  CardNode,
  DashboardNode,
  DashboardTabNode,
  DashboardCardNode,
  NativeQuerySnippetNode,
  TimelineNode,
  TimelineEventNode,
  ActionNode,
  DocumentNode,
  TransformNode,
  CatalogNode,
  ContentNode,
  GraphNode,
  ConsistencyIssue,
  IssueSeverity,
} from './types'

export { CatalogGraph } from './catalog-graph'
export { ContentGraph } from './content-graph'
export { validateConsistency } from './consistency'
export { buildDependencyGraph, pathKey } from './dependency-graph'
export type { DependencyPath, DependencyPathSegment, DependencyEdge, DependencyIssue, DependencyGraphResult, EntityRef, Cycle } from './dependency-graph'
export { parseDirectory } from './parser'
export type { ParsedEntities, DatabaseEntity } from './parser'

import { CatalogGraph } from './catalog-graph'
import { ContentGraph } from './content-graph'
import { parseDirectory } from './parser'

export interface MetabaseExport {
  catalog: CatalogGraph
  content: ContentGraph
}

export async function loadMetabaseExport(rootPath: string): Promise<MetabaseExport> {
  const entities = await parseDirectory(rootPath)
  const catalog = CatalogGraph.build(entities)
  const content = ContentGraph.build(entities)
  return { catalog, content }
}
