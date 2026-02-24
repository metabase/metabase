import type { CatalogGraph } from './catalog-graph'
import type { ContentGraph } from './content-graph'
import type { ParsedEntities } from './parser'

// --- Types ---

export interface DependencyPathSegment {
  model: string
  id: string
}

export type DependencyPath = DependencyPathSegment[]

export interface EntityRef {
  model: string
  id: string
  filePath: string
  name: string
}

export interface DependencyEdge {
  source: EntityRef
  target: DependencyPath
  referenceType: string
}

export interface DependencyIssue {
  severity: 'error' | 'warning'
  message: string
  filePath: string
  source: EntityRef
  target: DependencyPath
  referenceType: string
}

export interface Cycle {
  path: EntityRef[]
}

export interface DependencyGraphResult {
  entities: Map<string, EntityRef>
  edges: DependencyEdge[]
  issues: DependencyIssue[]
  cycles: Cycle[]
  loadOrder: EntityRef[]
}

// --- ID Predicates (matching Clojure serdes) ---

function isEntityId(value: string): boolean {
  return /^[A-Za-z0-9_-]{21}$/.test(value)
}

function isIdentityHash(value: string): boolean {
  return /^[0-9a-fA-F]{8}$/.test(value)
}

function isPortableId(value: unknown): boolean {
  return typeof value === 'string' && (isEntityId(value) || isIdentityHash(value))
}

// --- Path Helpers ---

export function pathKey(pathSegments: DependencyPath): string {
  return pathSegments.map(segment => `${segment.model}:${segment.id}`).join('/')
}

function tableToPath(tableRef: unknown[]): DependencyPath {
  const [databaseName, schema, tableName] = tableRef as [string, string | null, string]
  const result: DependencyPath = [{ model: 'Database', id: databaseName }]
  if (schema) {
    result.push({ model: 'Schema', id: schema })
  }
  result.push({ model: 'Table', id: tableName })
  return result
}

function fieldToPath(fieldRef: unknown[]): DependencyPath {
  const [databaseName, schema, tableName, fieldName] = fieldRef as [string, string | null, string, string]
  const result: DependencyPath = [{ model: 'Database', id: databaseName }]
  if (schema) {
    result.push({ model: 'Schema', id: schema })
  }
  result.push({ model: 'Table', id: tableName })
  result.push({ model: 'Field', id: fieldName })
  return result
}

// --- MBQL Dependency Walker ---

function isFieldVector(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length < 4) return false
  if (typeof value[0] !== 'string') return false
  if (value[1] !== null && typeof value[1] !== 'string') return false
  for (let index = 2; index < value.length; index++) {
    if (typeof value[index] !== 'string') return false
  }
  return true
}

function isTableVector(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length !== 3) return false
  if (typeof value[0] !== 'string') return false
  if (value[1] !== null && typeof value[1] !== 'string') return false
  if (typeof value[2] !== 'string') return false
  return true
}

function mbqlDepsVector(node: unknown[], deps: Set<string>): void {
  if (node.length === 0) return

  const tag = node[0]
  const tagStr = typeof tag === 'string' ? tag : ''

  if ((tagStr === 'field' || tagStr === 'field-id') && node.length >= 2 && isFieldVector(node[1])) {
    deps.add(pathKey(fieldToPath(node[1] as unknown[])))
    if (node.length >= 3 && node[2] != null && typeof node[2] === 'object') {
      mbqlDepsMap(node[2] as Record<string, unknown>, deps)
    }
    return
  }

  if (tagStr === 'metric' && node.length >= 2 && isPortableId(node[1])) {
    deps.add(pathKey([{ model: 'Card', id: node[1] as string }]))
    return
  }

  if (tagStr === 'segment' && node.length >= 2 && isPortableId(node[1])) {
    deps.add(pathKey([{ model: 'Segment', id: node[1] as string }]))
    return
  }

  if (tagStr === 'measure' && node.length >= 2 && isPortableId(node[1])) {
    deps.add(pathKey([{ model: 'Measure', id: node[1] as string }]))
    return
  }

  for (const element of node) {
    if (Array.isArray(element)) {
      mbqlDepsVector(element, deps)
    } else if (element != null && typeof element === 'object') {
      mbqlDepsMap(element as Record<string, unknown>, deps)
    }
  }
}

function mbqlDepsMap(node: Record<string, unknown>, deps: Set<string>): void {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'database' && typeof value === 'string' && value !== 'database/__virtual') {
      deps.add(pathKey([{ model: 'Database', id: value }]))
    } else if ((key === 'source-table' || key === 'source_table') && isTableVector(value)) {
      deps.add(pathKey(tableToPath(value as unknown[])))
    } else if ((key === 'source-table' || key === 'source_table') && isPortableId(value)) {
      deps.add(pathKey([{ model: 'Card', id: value as string }]))
    } else if ((key === 'source-field' || key === 'source_field') && isFieldVector(value)) {
      deps.add(pathKey(fieldToPath(value as unknown[])))
    } else if ((key === 'snippet-id' || key === 'snippet_id') && isPortableId(value)) {
      deps.add(pathKey([{ model: 'NativeQuerySnippet', id: value as string }]))
    } else if ((key === 'card_id' || key === 'card-id') && typeof value === 'string') {
      deps.add(pathKey([{ model: 'Card', id: value }]))
    } else if (Array.isArray(value)) {
      mbqlDepsVector(value, deps)
    } else if (value != null && typeof value === 'object') {
      mbqlDepsMap(value as Record<string, unknown>, deps)
    }
  }
}

function collectMbqlDeps(node: unknown): Set<string> {
  const deps = new Set<string>()
  if (node == null) return deps
  if (Array.isArray(node)) {
    mbqlDepsVector(node, deps)
  } else if (typeof node === 'object') {
    mbqlDepsMap(node as Record<string, unknown>, deps)
  }
  return deps
}

// --- Visualization Settings Dependencies ---

const LINK_CARD_MODEL_MAP: Record<string, string> = {
  card: 'Card',
  dataset: 'Card',
  question: 'Card',
  collection: 'Collection',
  database: 'Database',
  dashboard: 'Dashboard',
  table: 'Table',
}

function vizLinkCardDeps(settings: Record<string, unknown>, deps: Set<string>): void {
  const link = settings?.link as Record<string, unknown> | undefined
  const entity = link?.entity as Record<string, unknown> | undefined
  if (!entity) return

  const model = entity.model as string | undefined
  const id = entity.id
  if (!model || id == null) return

  const touccanModel = LINK_CARD_MODEL_MAP[model]
  if (!touccanModel) return

  if (model === 'table' && isTableVector(id)) {
    deps.add(pathKey(tableToPath(id as unknown[])))
  } else if (model === 'database' && typeof id === 'string') {
    deps.add(pathKey([{ model: 'Database', id }]))
  } else if (typeof id === 'string') {
    deps.add(pathKey([{ model: touccanModel, id }]))
  }
}

function vizClickBehaviorDeps(settings: Record<string, unknown>, deps: Set<string>): void {
  const clickBehavior = settings?.click_behavior as Record<string, unknown> | undefined
  if (!clickBehavior) return

  const { linkType, targetId, type } = clickBehavior as {
    linkType?: string
    targetId?: string
    type?: string
  }

  if (type === 'link' && linkType && typeof targetId === 'string') {
    const model = LINK_CARD_MODEL_MAP[linkType]
    if (model) {
      deps.add(pathKey([{ model, id: targetId }]))
    }
  }

  const parameterMapping = clickBehavior.parameterMapping
  if (parameterMapping != null && typeof parameterMapping === 'object') {
    for (const [jsonKey, value] of Object.entries(parameterMapping as Record<string, unknown>)) {
      try {
        const parsed = JSON.parse(jsonKey)
        collectMbqlDeps(parsed).forEach(dep => deps.add(dep))
      } catch {
        // key is not valid JSON, skip
      }
      if (value != null && typeof value === 'object') {
        const mapping = value as Record<string, unknown>
        collectMbqlDeps(mapping.id).forEach(dep => deps.add(dep))
        const target = mapping.target as Record<string, unknown> | undefined
        if (target) {
          collectMbqlDeps(target.dimension).forEach(dep => deps.add(dep))
        }
      }
    }
  }
}

function vizSettingsDeps(settings: unknown): Set<string> {
  const deps = new Set<string>()
  if (settings == null || typeof settings !== 'object') return deps

  const vizSettings = settings as Record<string, unknown>

  collectMbqlDeps(vizSettings).forEach(dep => deps.add(dep))

  vizLinkCardDeps(vizSettings, deps)
  vizClickBehaviorDeps(vizSettings, deps)

  const columnSettings = vizSettings.column_settings as Record<string, unknown> | undefined
  if (columnSettings) {
    for (const [jsonKey, value] of Object.entries(columnSettings)) {
      try {
        const parsed = JSON.parse(jsonKey)
        collectMbqlDeps(parsed).forEach(dep => deps.add(dep))
      } catch {
        // key is not valid JSON, skip
      }
      if (value != null && typeof value === 'object') {
        vizClickBehaviorDeps(value as Record<string, unknown>, deps)
      }
    }
  }

  return deps
}

// --- Parameter Dependencies ---

function parametersDeps(parameters: unknown): Set<string> {
  const deps = new Set<string>()
  if (!Array.isArray(parameters)) return deps

  for (const parameter of parameters) {
    if (parameter == null || typeof parameter !== 'object') continue
    const param = parameter as Record<string, unknown>

    if (String(param.values_source_type) === 'card') {
      const config = param.values_source_config as Record<string, unknown> | undefined
      if (config?.card_id && typeof config.card_id === 'string') {
        deps.add(pathKey([{ model: 'Card', id: config.card_id }]))
      }
      if (config?.value_field) {
        collectMbqlDeps(config.value_field).forEach(dep => deps.add(dep))
      }
    }
  }

  return deps
}

// --- Result Metadata Dependencies ---

function resultMetadataDeps(metadata: unknown): Set<string> {
  const deps = new Set<string>()
  if (!Array.isArray(metadata)) return deps

  for (const column of metadata) {
    if (column == null || typeof column !== 'object') continue
    const col = column as Record<string, unknown>

    if (col.table_id != null && isTableVector(col.table_id)) {
      deps.add(pathKey(tableToPath(col.table_id as unknown[])))
    }
    if (col.id != null && isFieldVector(col.id)) {
      deps.add(pathKey(fieldToPath(col.id as unknown[])))
    }
    if (col.field_ref != null) {
      collectMbqlDeps(col.field_ref).forEach(dep => deps.add(dep))
    }
    if (col.fk_target_field_id != null && isFieldVector(col.fk_target_field_id)) {
      deps.add(pathKey(fieldToPath(col.fk_target_field_id as unknown[])))
    }
  }

  return deps
}

// --- Per-Entity Dependency Extraction ---

function addDep(deps: Set<string>, model: string, id: string | null | undefined): void {
  if (id != null && id !== '') {
    deps.add(pathKey([{ model, id }]))
  }
}

function extractCardDeps(raw: Record<string, unknown>): Set<string> {
  const deps = new Set<string>()

  addDep(deps, 'Database', raw.database_id as string)
  if (isTableVector(raw.table_id)) {
    deps.add(pathKey(tableToPath(raw.table_id as unknown[])))
  }
  addDep(deps, 'Card', raw.source_card_id as string)
  addDep(deps, 'Collection', raw.collection_id as string)
  addDep(deps, 'Dashboard', raw.dashboard_id as string)
  addDep(deps, 'Document', raw.document_id as string)

  collectMbqlDeps(raw.dataset_query).forEach(dep => deps.add(dep))
  parametersDeps(raw.parameters).forEach(dep => deps.add(dep))

  if (Array.isArray(raw.parameter_mappings)) {
    for (const mapping of raw.parameter_mappings) {
      collectMbqlDeps(mapping).forEach(dep => deps.add(dep))
    }
  }

  resultMetadataDeps(raw.result_metadata).forEach(dep => deps.add(dep))
  vizSettingsDeps(raw.visualization_settings).forEach(dep => deps.add(dep))

  return deps
}

function extractDashboardDeps(raw: Record<string, unknown>): Set<string> {
  const deps = new Set<string>()

  addDep(deps, 'Collection', raw.collection_id as string)
  parametersDeps(raw.parameters).forEach(dep => deps.add(dep))

  const dashcards = Array.isArray(raw.dashcards) ? raw.dashcards : []
  for (const dashcard of dashcards) {
    if (dashcard == null || typeof dashcard !== 'object') continue
    const dc = dashcard as Record<string, unknown>

    addDep(deps, 'Card', dc.card_id as string)
    addDep(deps, 'Action', dc.action_id as string)

    if (Array.isArray(dc.parameter_mappings)) {
      for (const mapping of dc.parameter_mappings) {
        collectMbqlDeps(mapping).forEach(dep => deps.add(dep))
      }
    }

    vizSettingsDeps(dc.visualization_settings).forEach(dep => deps.add(dep))

    const series = Array.isArray(dc.series) ? dc.series : []
    for (const seriesItem of series) {
      if (seriesItem != null && typeof seriesItem === 'object') {
        addDep(deps, 'Card', (seriesItem as Record<string, unknown>).card_id as string)
      }
    }
  }

  return deps
}

function extractCollectionDeps(raw: Record<string, unknown>): Set<string> {
  const deps = new Set<string>()
  addDep(deps, 'Collection', raw.parent_id as string)
  return deps
}

function extractTableDeps(raw: Record<string, unknown>): Set<string> {
  const deps = new Set<string>()
  addDep(deps, 'Database', raw.db_id as string)
  addDep(deps, 'Collection', raw.collection_id as string)
  return deps
}

function extractFieldDeps(raw: Record<string, unknown>, serdesMeta: Array<{ model: string, id: string }>): Set<string> {
  const deps = new Set<string>()

  const tablePath = serdesMeta.filter(segment => segment.model !== 'Field')
  if (tablePath.length > 0) {
    deps.add(pathKey(tablePath))
  }

  if (isFieldVector(raw.fk_target_field_id)) {
    deps.add(pathKey(fieldToPath(raw.fk_target_field_id as unknown[])))
  }

  const dimensions = Array.isArray(raw.dimensions) ? raw.dimensions : []
  for (const dimension of dimensions) {
    if (dimension != null && typeof dimension === 'object') {
      const dim = dimension as Record<string, unknown>
      if (isFieldVector(dim.human_readable_field_id)) {
        deps.add(pathKey(fieldToPath(dim.human_readable_field_id as unknown[])))
      }
    }
  }

  return deps
}

function extractSegmentDeps(raw: Record<string, unknown>): Set<string> {
  const deps = new Set<string>()
  if (isTableVector(raw.table_id)) {
    deps.add(pathKey(tableToPath(raw.table_id as unknown[])))
  }
  collectMbqlDeps(raw.definition).forEach(dep => deps.add(dep))
  return deps
}

function extractMeasureDeps(raw: Record<string, unknown>): Set<string> {
  const deps = new Set<string>()
  if (isTableVector(raw.table_id)) {
    deps.add(pathKey(tableToPath(raw.table_id as unknown[])))
  }
  collectMbqlDeps(raw.definition).forEach(dep => deps.add(dep))
  return deps
}

function extractActionDeps(raw: Record<string, unknown>): Set<string> {
  const deps = new Set<string>()
  addDep(deps, 'Card', raw.model_id as string)

  if (raw.type === 'query') {
    const queryItems = Array.isArray(raw.query) ? raw.query : []
    for (const queryItem of queryItems) {
      if (queryItem != null && typeof queryItem === 'object') {
        const query = queryItem as Record<string, unknown>
        addDep(deps, 'Database', query.database_id as string)
        collectMbqlDeps(query.dataset_query).forEach(dep => deps.add(dep))
      }
    }
  }

  return deps
}

function extractSnippetDeps(raw: Record<string, unknown>): Set<string> {
  const deps = new Set<string>()
  addDep(deps, 'Collection', raw.collection_id as string)
  return deps
}

function extractTimelineDeps(raw: Record<string, unknown>): Set<string> {
  const deps = new Set<string>()
  addDep(deps, 'Collection', raw.collection_id as string)
  return deps
}

function extractDocumentDeps(raw: Record<string, unknown>): Set<string> {
  const deps = new Set<string>()
  addDep(deps, 'Collection', raw.collection_id as string)
  // ProseMirror AST deps would need deeper parsing; the raw.document field
  // contains card embeds and smart links, but walking AST nodes is best done
  // by the caller with access to the full document structure
  return deps
}

function extractTransformDeps(raw: Record<string, unknown>): Set<string> {
  const deps = new Set<string>()
  addDep(deps, 'Collection', raw.collection_id as string)
  addDep(deps, 'Database', raw.source_database_id as string)
  collectMbqlDeps(raw.source).forEach(dep => deps.add(dep))

  const tags = Array.isArray(raw.tags) ? raw.tags : []
  for (const tag of tags) {
    if (tag != null && typeof tag === 'object') {
      addDep(deps, 'TransformTag', (tag as Record<string, unknown>).tag_id as string)
    }
  }

  return deps
}

// --- Graph Builder ---

function entityRefFromPath(
  serdesMeta: Array<{ model: string, id: string }>,
  filePath: string,
  name: string,
): EntityRef {
  const last = serdesMeta[serdesMeta.length - 1]
  return { model: last.model, id: last.id, filePath, name }
}

function entityPathKey(serdesMeta: Array<{ model: string, id: string }>): string {
  return pathKey(serdesMeta.map(segment => ({ model: segment.model, id: segment.id })))
}

type DepsExtractor = (raw: Record<string, unknown>, serdesMeta: Array<{ model: string, id: string }>) => Set<string>

const ENTITY_DEPS_EXTRACTORS: Record<string, DepsExtractor> = {
  Card: (raw) => extractCardDeps(raw),
  Dashboard: (raw) => extractDashboardDeps(raw),
  Collection: (raw) => extractCollectionDeps(raw),
  Table: (raw) => extractTableDeps(raw),
  Field: (raw, meta) => extractFieldDeps(raw, meta),
  Segment: (raw) => extractSegmentDeps(raw),
  Measure: (raw) => extractMeasureDeps(raw),
  Action: (raw) => extractActionDeps(raw),
  NativeQuerySnippet: (raw) => extractSnippetDeps(raw),
  Timeline: (raw) => extractTimelineDeps(raw),
  Document: (raw) => extractDocumentDeps(raw),
  Transform: (raw) => extractTransformDeps(raw),
}

export function buildDependencyGraph(
  entities: ParsedEntities,
  catalog: CatalogGraph,
  content: ContentGraph,
): DependencyGraphResult {
  const entityMap = new Map<string, EntityRef>()
  const edges: DependencyEdge[] = []
  const adjacency = new Map<string, Set<string>>()

  interface RawEntity {
    raw: Record<string, unknown>
    filePath: string
    name: string
    serdesMeta: Array<{ model: string, id: string }>
  }

  const rawEntities: RawEntity[] = []

  for (const database of catalog.databases) {
    const key = pathKey([{ model: 'Database', id: database.name }])
    entityMap.set(key, { model: 'Database', id: database.name, filePath: database.filePath ?? '', name: database.name })
  }

  for (const table of entities.tables) {
    const serdesMeta = buildTableMeta(table)
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'Table', id: table.name, filePath: table.filePath, name: table.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: table.raw, filePath: table.filePath, name: table.name, serdesMeta })
  }

  for (const field of entities.fields) {
    const serdesMeta = buildFieldMeta(field)
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'Field', id: field.name, filePath: field.filePath, name: field.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: field.raw, filePath: field.filePath, name: field.name, serdesMeta })
  }

  for (const collection of entities.collections) {
    const serdesMeta = [{ model: 'Collection', id: collection.entityId }]
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'Collection', id: collection.entityId, filePath: collection.filePath, name: collection.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: collection.raw, filePath: collection.filePath, name: collection.name, serdesMeta })
  }

  for (const card of entities.cards) {
    const serdesMeta = [{ model: 'Card', id: card.entityId }]
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'Card', id: card.entityId, filePath: card.filePath, name: card.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: card.raw, filePath: card.filePath, name: card.name, serdesMeta })
  }

  for (const dashboard of entities.dashboards) {
    const serdesMeta = [{ model: 'Dashboard', id: dashboard.entityId }]
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'Dashboard', id: dashboard.entityId, filePath: dashboard.filePath, name: dashboard.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: dashboard.raw, filePath: dashboard.filePath, name: dashboard.name, serdesMeta })
  }

  for (const snippet of entities.snippets) {
    const serdesMeta = [{ model: 'NativeQuerySnippet', id: snippet.entityId }]
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'NativeQuerySnippet', id: snippet.entityId, filePath: snippet.filePath, name: snippet.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: snippet.raw, filePath: snippet.filePath, name: snippet.name, serdesMeta })
  }

  for (const timeline of entities.timelines) {
    const serdesMeta = [{ model: 'Timeline', id: timeline.entityId }]
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'Timeline', id: timeline.entityId, filePath: timeline.filePath, name: timeline.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: timeline.raw, filePath: timeline.filePath, name: timeline.name, serdesMeta })
  }

  for (const action of entities.actions) {
    const serdesMeta = [{ model: 'Action', id: action.entityId }]
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'Action', id: action.entityId, filePath: action.filePath, name: action.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: action.raw, filePath: action.filePath, name: action.name, serdesMeta })
  }

  for (const document of entities.documents) {
    const serdesMeta = [{ model: 'Document', id: document.entityId }]
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'Document', id: document.entityId, filePath: document.filePath, name: document.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: document.raw, filePath: document.filePath, name: document.name, serdesMeta })
  }

  for (const measure of entities.measures) {
    const serdesMeta = buildMeasureMeta(measure)
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'Measure', id: measure.entityId, filePath: measure.filePath, name: measure.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: measure.raw, filePath: measure.filePath, name: measure.name, serdesMeta })
  }

  for (const segment of entities.segments) {
    const serdesMeta = buildSegmentMeta(segment)
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'Segment', id: segment.entityId, filePath: segment.filePath, name: segment.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: segment.raw, filePath: segment.filePath, name: segment.name, serdesMeta })
  }

  for (const transform of entities.transforms) {
    const serdesMeta = [{ model: 'Transform', id: transform.entityId }]
    const key = entityPathKey(serdesMeta)
    const ref: EntityRef = { model: 'Transform', id: transform.entityId, filePath: transform.filePath, name: transform.name }
    entityMap.set(key, ref)
    rawEntities.push({ raw: transform.raw, filePath: transform.filePath, name: transform.name, serdesMeta })
  }

  // Extract dependencies for all entities
  for (const rawEntity of rawEntities) {
    const model = rawEntity.serdesMeta[rawEntity.serdesMeta.length - 1].model
    const extractor = ENTITY_DEPS_EXTRACTORS[model]
    if (!extractor) continue

    const sourceKey = entityPathKey(rawEntity.serdesMeta)
    const sourceRef = entityMap.get(sourceKey)!
    const depKeys = extractor(rawEntity.raw, rawEntity.serdesMeta)

    if (!adjacency.has(sourceKey)) {
      adjacency.set(sourceKey, new Set())
    }

    for (const depKey of depKeys) {
      adjacency.get(sourceKey)!.add(depKey)
      const targetSegments = depKey.split('/').map(segment => {
        const [depModel, ...idParts] = segment.split(':')
        return { model: depModel, id: idParts.join(':') }
      })
      edges.push({ source: sourceRef, target: targetSegments, referenceType: targetSegments[targetSegments.length - 1].model })
    }
  }

  // Validate: check for missing dependencies
  const issues: DependencyIssue[] = []
  for (const edge of edges) {
    const targetKey = pathKey(edge.target)
    if (!entityMap.has(targetKey)) {
      const targetModel = edge.target[edge.target.length - 1].model
      const targetId = edge.target[edge.target.length - 1].id
      // Schema segments are not independent entities
      if (targetModel === 'Schema') continue

      issues.push({
        severity: 'error',
        message: `Missing dependency: ${edge.source.model} "${edge.source.name}" requires ${targetModel} "${targetId}" which is not in the export`,
        filePath: edge.source.filePath,
        source: edge.source,
        target: edge.target,
        referenceType: edge.referenceType,
      })
    }
  }

  // Detect cycles using DFS with coloring
  const cycles = detectCycles(adjacency, entityMap)

  // Compute topological load order
  const loadOrder = computeLoadOrder(adjacency, entityMap)

  return { entities: entityMap, edges, issues, cycles, loadOrder }
}

// --- Cycle Detection ---

const enum Color { White, Gray, Black }

function detectCycles(
  adjacency: Map<string, Set<string>>,
  entityMap: Map<string, EntityRef>,
): Cycle[] {
  const cycles: Cycle[] = []
  const colors = new Map<string, Color>()
  const parent = new Map<string, string | null>()

  for (const key of adjacency.keys()) {
    colors.set(key, Color.White)
  }

  function dfs(node: string): void {
    colors.set(node, Color.Gray)

    const neighbors = adjacency.get(node)
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!adjacency.has(neighbor)) continue

        const color = colors.get(neighbor) ?? Color.White
        if (color === Color.Gray) {
          const cyclePath: EntityRef[] = []
          let current: string | null | undefined = node
          while (current && current !== neighbor) {
            const ref = entityMap.get(current)
            if (ref) cyclePath.unshift(ref)
            current = parent.get(current)
          }
          const neighborRef = entityMap.get(neighbor)
          if (neighborRef) cyclePath.unshift(neighborRef)
          cycles.push({ path: cyclePath })
        } else if (color === Color.White) {
          parent.set(neighbor, node)
          dfs(neighbor)
        }
      }
    }

    colors.set(node, Color.Black)
  }

  for (const key of adjacency.keys()) {
    if (colors.get(key) === Color.White) {
      parent.set(key, null)
      dfs(key)
    }
  }

  return cycles
}

// --- Topological Sort ---

function computeLoadOrder(
  adjacency: Map<string, Set<string>>,
  entityMap: Map<string, EntityRef>,
): EntityRef[] {
  const inDegree = new Map<string, number>()
  const allNodes = new Set<string>()

  for (const [node, neighbors] of adjacency) {
    allNodes.add(node)
    if (!inDegree.has(node)) inDegree.set(node, 0)
    for (const neighbor of neighbors) {
      if (adjacency.has(neighbor)) {
        allNodes.add(neighbor)
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1)
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = []
  for (const node of allNodes) {
    if ((inDegree.get(node) ?? 0) === 0) {
      queue.push(node)
    }
  }

  const order: EntityRef[] = []
  const visited = new Set<string>()

  while (queue.length > 0) {
    const node = queue.shift()!
    if (visited.has(node)) continue
    visited.add(node)

    const ref = entityMap.get(node)
    if (ref) order.push(ref)

    const neighbors = adjacency.get(node)
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!adjacency.has(neighbor)) continue
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) {
          queue.push(neighbor)
        }
      }
    }
  }

  // Entities in cycles won't appear in topo sort; append them at the end
  for (const node of allNodes) {
    if (!visited.has(node)) {
      const ref = entityMap.get(node)
      if (ref) order.push(ref)
    }
  }

  return order
}

// --- Path Builders for catalog entities ---

function buildTableMeta(table: { databaseName: string, schemaName: string, name: string }): Array<{ model: string, id: string }> {
  const result: Array<{ model: string, id: string }> = [{ model: 'Database', id: table.databaseName }]
  if (table.schemaName) {
    result.push({ model: 'Schema', id: table.schemaName })
  }
  result.push({ model: 'Table', id: table.name })
  return result
}

function buildFieldMeta(field: { databaseName: string, schemaName: string, tableName: string, name: string }): Array<{ model: string, id: string }> {
  const result: Array<{ model: string, id: string }> = [{ model: 'Database', id: field.databaseName }]
  if (field.schemaName) {
    result.push({ model: 'Schema', id: field.schemaName })
  }
  result.push({ model: 'Table', id: field.tableName })
  result.push({ model: 'Field', id: field.name })
  return result
}

function buildMeasureMeta(measure: { entityId: string }): Array<{ model: string, id: string }> {
  return [{ model: 'Measure', id: measure.entityId }]
}

function buildSegmentMeta(segment: { entityId: string }): Array<{ model: string, id: string }> {
  return [{ model: 'Segment', id: segment.entityId }]
}
