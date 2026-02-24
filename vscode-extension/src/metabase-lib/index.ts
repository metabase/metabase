import { CatalogGraph } from './catalog-graph'
import { ContentGraph } from './content-graph'
import { parseDirectory } from './parser'

export { CatalogGraph } from './catalog-graph'

export { validateConsistency } from './consistency'
export { ContentGraph } from './content-graph'
export { buildDependencyGraph, pathKey } from './dependency-graph'
export type { Cycle, DependencyEdge, DependencyGraphResult, DependencyIssue, DependencyPath, DependencyPathSegment, EntityRef } from './dependency-graph'
export { parseDirectory } from './parser'
export type { DatabaseEntity, ParsedEntities } from './parser'
export type {
  ActionNode,
  CardNode,
  CatalogNode,
  CollectionNode,
  ConsistencyIssue,
  ContentNode,
  DashboardCardNode,
  DashboardNode,
  DashboardTabNode,
  DatabaseNode,
  DocumentNode,
  FieldNode,
  FieldRef,
  GraphNode,
  IssueSeverity,
  MeasureNode,
  NativeQuerySnippetNode,
  SchemaNode,
  SegmentNode,
  TableNode,
  TableRef,
  TimelineEventNode,
  TimelineNode,
  TransformNode,
} from './types'

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
