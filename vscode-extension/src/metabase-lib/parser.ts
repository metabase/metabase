import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type {
  ActionNode,
  CardNode,
  CollectionNode,
  DashboardCardNode,
  DashboardNode,
  DashboardTabNode,
  DocumentNode,
  FieldNode,
  FieldRef,
  MeasureNode,
  NativeQuerySnippetNode,
  SegmentNode,
  TableNode,
  TableRef,
  TimelineEventNode,
  TimelineNode,
  TransformNode,
} from './types'

export interface DatabaseEntity {
  name: string
  engine: string | null
  description: string | null
  filePath: string
  raw: Record<string, unknown>
}

export interface ParsedEntities {
  databases: DatabaseEntity[]
  tables: TableNode[]
  fields: FieldNode[]
  measures: MeasureNode[]
  segments: SegmentNode[]
  collections: CollectionNode[]
  cards: CardNode[]
  dashboards: DashboardNode[]
  snippets: NativeQuerySnippetNode[]
  timelines: TimelineNode[]
  actions: ActionNode[]
  documents: DocumentNode[]
  transforms: TransformNode[]
}

interface SerdesMetaEntry {
  id: string
  label?: string
  model: string
}

interface ParsedYaml {
  filePath: string
  data: Record<string, unknown>
  serdesMeta: SerdesMetaEntry[]
  model: string
}

// --- Helpers ---

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function bool(value: unknown, defaultValue = false): boolean {
  return typeof value === 'boolean' ? value : defaultValue
}

function num(value: unknown, defaultValue = 0): number {
  return typeof value === 'number' ? value : defaultValue
}

function extractPathId(serdesMeta: SerdesMetaEntry[], model: string): string {
  return serdesMeta.find(entry => entry.model === model)?.id ?? ''
}

function toTableRef(value: unknown): TableRef | null {
  if (!Array.isArray(value) || value.length !== 3)
    return null
  if (typeof value[0] !== 'string')
    return null
  if (value[1] !== null && typeof value[1] !== 'string')
    return null
  if (typeof value[2] !== 'string')
    return null
  return value as unknown as TableRef
}

function toFieldRef(value: unknown): FieldRef | null {
  if (!Array.isArray(value) || value.length < 4)
    return null
  if (typeof value[0] !== 'string')
    return null
  if (value[1] !== null && typeof value[1] !== 'string')
    return null
  for (let index = 2; index < value.length; index++) {
    if (typeof value[index] !== 'string')
      return null
  }
  return value as unknown as FieldRef
}

// --- YAML File Discovery ---

async function findYamlFiles(directory: string): Promise<string[]> {
  const results: string[] = []
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  }
  catch {
    return results
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      results.push(...await findYamlFiles(fullPath))
    }
    else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      results.push(fullPath)
    }
  }
  return results
}

function parseYamlFile(filePath: string, content: string): ParsedYaml | null {
  const data = parseYaml(content)
  if (!data || typeof data !== 'object')
    return null

  const serdesMeta = (data as Record<string, unknown>)['serdes/meta']
  if (!Array.isArray(serdesMeta) || serdesMeta.length === 0)
    return null

  const model = serdesMeta[serdesMeta.length - 1].model
  if (typeof model !== 'string')
    return null

  return { filePath, data: data as Record<string, unknown>, serdesMeta, model }
}

// --- Entity Builders ---

function buildDatabase(parsed: ParsedYaml): DatabaseEntity {
  const { data, filePath } = parsed
  return {
    name: str(data.name),
    engine: strOrNull(data.engine),
    description: strOrNull(data.description),
    filePath,
    raw: data,
  }
}

function buildTable(parsed: ParsedYaml): TableNode {
  const { data, filePath, serdesMeta } = parsed
  return {
    kind: 'table',
    name: str(data.name),
    displayName: str(data.display_name || data.name),
    description: strOrNull(data.description),
    databaseName: extractPathId(serdesMeta, 'Database'),
    schemaName: extractPathId(serdesMeta, 'Schema'),
    entityType: strOrNull(data.entity_type),
    active: bool(data.active, true),
    collectionId: strOrNull(data.collection_id),
    transformId: strOrNull(data.transform_id),
    fields: [],
    measures: [],
    segments: [],
    filePath,
    raw: data,
  }
}

function buildField(parsed: ParsedYaml): FieldNode {
  const { data, filePath, serdesMeta } = parsed
  return {
    kind: 'field',
    name: str(data.name),
    displayName: str(data.display_name || data.name),
    description: strOrNull(data.description),
    databaseName: extractPathId(serdesMeta, 'Database'),
    schemaName: extractPathId(serdesMeta, 'Schema'),
    tableName: extractPathId(serdesMeta, 'Table'),
    databaseType: str(data.database_type),
    baseType: str(data.base_type),
    effectiveType: str(data.effective_type),
    semanticType: strOrNull(data.semantic_type),
    fkTargetFieldRef: toFieldRef(data.fk_target_field_id),
    position: num(data.position),
    active: bool(data.active, true),
    filePath,
    raw: data,
  }
}

function buildMeasure(parsed: ParsedYaml): MeasureNode {
  const { data, filePath } = parsed
  const tableRef = toTableRef(data.table_id)
  return {
    kind: 'measure',
    entityId: str(data.entity_id),
    name: str(data.name),
    description: strOrNull(data.description),
    databaseName: tableRef?.[0] ?? '',
    schemaName: tableRef?.[1] ?? '',
    tableName: tableRef?.[2] ?? '',
    archived: bool(data.archived),
    filePath,
    raw: data,
  }
}

function buildSegment(parsed: ParsedYaml): SegmentNode {
  const { data, filePath } = parsed
  const tableRef = toTableRef(data.table_id)
  return {
    kind: 'segment',
    entityId: str(data.entity_id),
    name: str(data.name),
    description: strOrNull(data.description),
    databaseName: tableRef?.[0] ?? '',
    schemaName: tableRef?.[1] ?? '',
    tableName: tableRef?.[2] ?? '',
    archived: bool(data.archived),
    filePath,
    raw: data,
  }
}

function buildCollection(parsed: ParsedYaml): CollectionNode {
  const { data, filePath } = parsed
  return {
    kind: 'collection',
    entityId: str(data.entity_id),
    name: str(data.name),
    description: strOrNull(data.description),
    collectionType: strOrNull(data.type),
    parentId: strOrNull(data.parent_id),
    archived: bool(data.archived),
    children: [],
    cards: [],
    dashboards: [],
    snippets: [],
    timelines: [],
    documents: [],
    filePath,
    raw: data,
  }
}

function buildCard(parsed: ParsedYaml): CardNode {
  const { data, filePath } = parsed
  return {
    kind: 'card',
    entityId: str(data.entity_id),
    name: str(data.name),
    description: strOrNull(data.description),
    display: str(data.display),
    queryType: str(data.query_type),
    cardType: str(data.type),
    collectionId: strOrNull(data.collection_id),
    databaseId: strOrNull(data.database_id),
    tableRef: toTableRef(data.table_id),
    sourceCardId: strOrNull(data.source_card_id),
    archived: bool(data.archived),
    filePath,
    raw: data,
  }
}

function buildDashboardTab(tabData: Record<string, unknown>): DashboardTabNode {
  return {
    kind: 'dashboard_tab',
    entityId: str(tabData.entity_id),
    name: str(tabData.name),
    position: num(tabData.position),
  }
}

function buildDashboardCard(cardData: Record<string, unknown>): DashboardCardNode {
  return {
    kind: 'dashboard_card',
    entityId: str(cardData.entity_id),
    cardId: strOrNull(cardData.card_id),
    actionId: strOrNull(cardData.action_id),
    dashboardTabId: strOrNull(cardData.dashboard_tab_id),
    row: num(cardData.row),
    col: num(cardData.col),
    sizeX: num(cardData.size_x),
    sizeY: num(cardData.size_y),
  }
}

function buildDashboard(parsed: ParsedYaml): DashboardNode {
  const { data, filePath } = parsed
  const rawTabs = Array.isArray(data.tabs) ? data.tabs : []
  const rawDashcards = Array.isArray(data.dashcards) ? data.dashcards : []
  return {
    kind: 'dashboard',
    entityId: str(data.entity_id),
    name: str(data.name),
    description: strOrNull(data.description),
    collectionId: strOrNull(data.collection_id),
    archived: bool(data.archived),
    tabs: rawTabs.map((tab: Record<string, unknown>) => buildDashboardTab(tab)),
    dashcards: rawDashcards.map((dashcard: Record<string, unknown>) => buildDashboardCard(dashcard)),
    filePath,
    raw: data,
  }
}

function buildNativeQuerySnippet(parsed: ParsedYaml): NativeQuerySnippetNode {
  const { data, filePath } = parsed
  return {
    kind: 'native_query_snippet',
    entityId: str(data.entity_id),
    name: str(data.name),
    description: strOrNull(data.description),
    content: str(data.content),
    collectionId: strOrNull(data.collection_id),
    archived: bool(data.archived),
    filePath,
    raw: data,
  }
}

function buildTimelineEvent(eventData: Record<string, unknown>): TimelineEventNode {
  return {
    kind: 'timeline_event',
    name: str(eventData.name),
    description: strOrNull(eventData.description),
    icon: strOrNull(eventData.icon),
    timestamp: strOrNull(eventData.timestamp),
    archived: bool(eventData.archived),
  }
}

function buildTimeline(parsed: ParsedYaml): TimelineNode {
  const { data, filePath } = parsed
  const rawEvents = Array.isArray(data.events) ? data.events : []
  return {
    kind: 'timeline',
    entityId: str(data.entity_id),
    name: str(data.name),
    description: strOrNull(data.description),
    icon: strOrNull(data.icon),
    collectionId: strOrNull(data.collection_id),
    archived: bool(data.archived),
    events: rawEvents.map((event: Record<string, unknown>) => buildTimelineEvent(event)),
    filePath,
    raw: data,
  }
}

function buildAction(parsed: ParsedYaml): ActionNode {
  const { data, filePath } = parsed
  return {
    kind: 'action',
    entityId: str(data.entity_id),
    name: str(data.name),
    description: strOrNull(data.description),
    type: str(data.type),
    modelId: strOrNull(data.model_id),
    archived: bool(data.archived),
    filePath,
    raw: data,
  }
}

function buildDocument(parsed: ParsedYaml): DocumentNode {
  const { data, filePath } = parsed
  return {
    kind: 'document',
    entityId: str(data.entity_id),
    name: str(data.name),
    description: strOrNull(data.description),
    contentType: strOrNull(data.content_type),
    collectionId: strOrNull(data.collection_id),
    archived: bool(data.archived),
    filePath,
    raw: data,
  }
}

function buildTransform(parsed: ParsedYaml): TransformNode {
  const { data, filePath } = parsed
  return {
    kind: 'transform',
    entityId: str(data.entity_id),
    name: str(data.name),
    description: strOrNull(data.description),
    sourceDatabaseId: strOrNull(data.source_database_id),
    collectionId: strOrNull(data.collection_id),
    filePath,
    raw: data,
  }
}

// --- Main Parser ---

const MODEL_BUILDERS: Record<string, (parsed: ParsedYaml) => unknown> = {
  Database: buildDatabase,
  Table: buildTable,
  Field: buildField,
  Measure: buildMeasure,
  Segment: buildSegment,
  Collection: buildCollection,
  Card: buildCard,
  Dashboard: buildDashboard,
  NativeQuerySnippet: buildNativeQuerySnippet,
  Timeline: buildTimeline,
  Action: buildAction,
  Document: buildDocument,
  Transform: buildTransform,
}

const MODEL_TO_KEY: Record<string, keyof ParsedEntities> = {
  Database: 'databases',
  Table: 'tables',
  Field: 'fields',
  Measure: 'measures',
  Segment: 'segments',
  Collection: 'collections',
  Card: 'cards',
  Dashboard: 'dashboards',
  NativeQuerySnippet: 'snippets',
  Timeline: 'timelines',
  Action: 'actions',
  Document: 'documents',
  Transform: 'transforms',
}

export async function parseDirectory(rootPath: string): Promise<ParsedEntities> {
  const yamlFiles = await findYamlFiles(rootPath)

  const result: ParsedEntities = {
    databases: [],
    tables: [],
    fields: [],
    measures: [],
    segments: [],
    collections: [],
    cards: [],
    dashboards: [],
    snippets: [],
    timelines: [],
    actions: [],
    documents: [],
    transforms: [],
  }

  const fileContents = await Promise.all(
    yamlFiles.map(async (filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        return { filePath, content }
      }
      catch {
        return null
      }
    }),
  )

  for (const file of fileContents) {
    if (!file)
      continue
    const parsed = parseYamlFile(file.filePath, file.content)
    if (!parsed)
      continue

    const builder = MODEL_BUILDERS[parsed.model]
    const key = MODEL_TO_KEY[parsed.model]
    if (builder && key) {
      ;(result[key] as unknown[]).push(builder(parsed))
    }
  }

  return result
}
