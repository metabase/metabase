import type { CardNode, TransformNode, FieldNode, TableNode } from "./types"
import type { CatalogGraph } from "./catalog-graph"
import type {
  NotebookData,
  NotebookMetadata,
  NotebookMetadataDatabase,
  NotebookMetadataTable,
  NotebookMetadataField,
} from "../shared-types"

/**
 * Deterministic numeric ID from a string key.
 * Uses a simple hash to produce stable positive integers.
 */
function syntheticId(key: string): number {
  let hash = 5381
  for (let index = 0; index < key.length; index++) {
    hash = ((hash << 5) + hash + key.charCodeAt(index)) | 0
  }
  return Math.abs(hash) || 1
}

function databaseId(databaseName: string): number {
  return syntheticId(`db:${databaseName}`)
}

function tableId(databaseName: string, schemaName: string | null, tableName: string): number {
  return syntheticId(`table:${databaseName}\0${schemaName ?? ""}\0${tableName}`)
}

function fieldId(
  databaseName: string,
  schemaName: string | null,
  tableName: string,
  fieldName: string,
): number {
  return syntheticId(`field:${databaseName}\0${schemaName ?? ""}\0${tableName}\0${fieldName}`)
}

class MetadataCollector {
  private databases = new Map<number, NotebookMetadataDatabase>()
  private tables = new Map<number, NotebookMetadataTable>()
  private fields = new Map<number, NotebookMetadataField>()

  constructor(private catalog: CatalogGraph | null) {}

  ensureDatabase(databaseName: string): number {
    const numericId = databaseId(databaseName)
    if (!this.databases.has(numericId)) {
      const databaseNode = this.catalog?.getDatabase(databaseName)
      this.databases.set(numericId, {
        id: numericId,
        name: databaseName,
        engine: databaseNode?.engine ?? "postgres",
        features: [
          "left-join", "right-join", "inner-join", "full-join",
          "expressions", "native-parameters", "nested-queries",
          "case-sensitivity-string-filter-options", "binning",
          "expression-aggregations", "foreign-keys",
          "native-query-snippets", "window-functions",
        ],
      })
    }
    return numericId
  }

  ensureTable(databaseName: string, schemaName: string | null, tableName: string): number {
    const numericTableId = tableId(databaseName, schemaName, tableName)
    if (!this.tables.has(numericTableId)) {
      const tableNode = this.catalog?.getTable(databaseName, schemaName, tableName)
      const numericDatabaseId = this.ensureDatabase(databaseName)

      this.tables.set(numericTableId, {
        id: numericTableId,
        db_id: numericDatabaseId,
        name: tableName,
        display_name: tableNode?.displayName ?? tableName,
        schema: schemaName ?? "public",
        fields: [],
      })

      if (tableNode) {
        for (const field of tableNode.fields) {
          this.ensureField(field)
        }
        const tableEntry = this.tables.get(numericTableId)!
        tableEntry.fields = tableNode.fields.map(field =>
          fieldId(field.databaseName, field.schemaName, field.tableName, field.name),
        )
      }
    }
    return numericTableId
  }

  ensureField(fieldNode: FieldNode): number {
    const numericFieldId = fieldId(
      fieldNode.databaseName,
      fieldNode.schemaName,
      fieldNode.tableName,
      fieldNode.name,
    )
    if (!this.fields.has(numericFieldId)) {
      const numericTableId = tableId(
        fieldNode.databaseName,
        fieldNode.schemaName,
        fieldNode.tableName,
      )
      this.fields.set(numericFieldId, {
        id: numericFieldId,
        table_id: numericTableId,
        name: fieldNode.name,
        display_name: fieldNode.displayName,
        base_type: fieldNode.baseType || "type/Text",
        semantic_type: fieldNode.semanticType,
      })
    }
    return numericFieldId
  }

  ensureFieldByRef(
    databaseName: string,
    schemaName: string | null,
    tableName: string,
    fieldName: string,
  ): number {
    const numericFieldId = fieldId(databaseName, schemaName, tableName, fieldName)
    if (!this.fields.has(numericFieldId)) {
      const catalogField = this.catalog?.getField(databaseName, schemaName, tableName, fieldName)
      if (catalogField) {
        return this.ensureField(catalogField)
      }
      const numericTableId = tableId(databaseName, schemaName, tableName)
      this.fields.set(numericFieldId, {
        id: numericFieldId,
        table_id: numericTableId,
        name: fieldName,
        display_name: fieldName.replace(/_/g, " "),
        base_type: "type/Text",
        semantic_type: null,
      })
    }
    return numericFieldId
  }

  toMetadata(): NotebookMetadata {
    return {
      databases: Object.fromEntries(this.databases),
      tables: Object.fromEntries(this.tables),
      fields: Object.fromEntries(this.fields),
    }
  }
}

/**
 * Deep-walks the dataset_query and replaces all symbolic references with numeric IDs.
 */
function rewriteDatasetQuery(
  datasetQuery: Record<string, unknown>,
  collector: MetadataCollector,
): Record<string, unknown> {
  const databaseName = String(datasetQuery.database ?? "")
  const numericDatabaseId = collector.ensureDatabase(databaseName)

  const result: Record<string, unknown> = {
    ...datasetQuery,
    database: numericDatabaseId,
  }

  if (datasetQuery.type === "query" && datasetQuery.query) {
    result.query = rewriteQueryClause(
      datasetQuery.query as Record<string, unknown>,
      databaseName,
      collector,
    )
  }

  return result
}

function rewriteQueryClause(
  query: Record<string, unknown>,
  defaultDatabase: string,
  collector: MetadataCollector,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...query }

  if (query["source-table"]) {
    result["source-table"] = rewriteTableRef(query["source-table"], defaultDatabase, collector)
  }

  if (Array.isArray(query.filter)) {
    result.filter = rewriteValue(query.filter, defaultDatabase, collector)
  }

  if (Array.isArray(query.aggregation)) {
    result.aggregation = query.aggregation.map((item: unknown) =>
      rewriteValue(item, defaultDatabase, collector),
    )
  }

  if (Array.isArray(query.breakout)) {
    result.breakout = query.breakout.map((item: unknown) =>
      rewriteValue(item, defaultDatabase, collector),
    )
  }

  if (Array.isArray(query["order-by"])) {
    result["order-by"] = query["order-by"].map((item: unknown) =>
      rewriteValue(item, defaultDatabase, collector),
    )
  }

  if (query.expressions && typeof query.expressions === "object") {
    const expressions: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(query.expressions as Record<string, unknown>)) {
      expressions[key] = Array.isArray(value)
        ? rewriteValue(value, defaultDatabase, collector)
        : value
    }
    result.expressions = expressions
  }

  if (Array.isArray(query.joins)) {
    result.joins = query.joins.map((join: unknown) => {
      if (!join || typeof join !== "object") return join
      const joinObj = join as Record<string, unknown>
      const rewritten: Record<string, unknown> = { ...joinObj }
      if (joinObj["source-table"]) {
        rewritten["source-table"] = rewriteTableRef(joinObj["source-table"], defaultDatabase, collector)
      }
      if (Array.isArray(joinObj.condition)) {
        rewritten.condition = rewriteValue(joinObj.condition, defaultDatabase, collector)
      }
      return rewritten
    })
  }

  return result
}

function rewriteTableRef(
  ref: unknown,
  defaultDatabase: string,
  collector: MetadataCollector,
): unknown {
  if (Array.isArray(ref) && ref.length >= 3 && ref.every(item => typeof item === "string" || item === null)) {
    const [databaseName, schemaName, tableName] = ref.map((item) =>
      item === null ? null : String(item),
    )
    return collector.ensureTable(databaseName ?? defaultDatabase, schemaName, tableName!)
  }
  return ref
}

function rewriteValue(
  value: unknown,
  defaultDatabase: string,
  collector: MetadataCollector,
): unknown {
  if (!Array.isArray(value)) {
    return value
  }

  // Field reference: ["field", ["db", "schema", "table", "col"], opts]
  if (value[0] === "field" && Array.isArray(value[1]) && value[1].length >= 4) {
    const [databaseName, schemaName, tableName, fieldName] = value[1].map(
      (part: unknown) => (part === null ? null : String(part)),
    )
    const numericId = collector.ensureFieldByRef(
      databaseName ?? defaultDatabase,
      schemaName,
      tableName!,
      fieldName!,
    )
    collector.ensureTable(databaseName ?? defaultDatabase, schemaName, tableName!)
    return ["field", numericId, value[2] ?? null]
  }

  // Expression reference: ["expression", name] — leave as-is
  if (value[0] === "expression") {
    return value
  }

  // Aggregation reference: ["aggregation", index] — leave as-is
  if (value[0] === "aggregation") {
    return value
  }

  // Recursively rewrite sub-expressions
  return value.map((item: unknown) => rewriteValue(item, defaultDatabase, collector))
}

export function buildNotebookDataFromCard(
  card: CardNode,
  catalog: CatalogGraph | null,
): NotebookData {
  const raw = card.raw
  const datasetQuery = raw.dataset_query as Record<string, unknown> | undefined

  const databaseName = datasetQuery
    ? String((datasetQuery as Record<string, unknown>).database ?? "")
    : card.databaseId ?? ""

  const queryType = datasetQuery
    ? String((datasetQuery as Record<string, unknown>).type ?? "query")
    : card.queryType

  if (queryType === "native") {
    const native = (datasetQuery as Record<string, unknown>)?.native as Record<string, unknown> | undefined
    return {
      name: card.name,
      description: card.description,
      database: databaseName || null,
      cardType: card.cardType,
      queryType: "native",
      nativeSql: native ? String(native.query ?? "") : null,
      datasetQuery: null,
      metadata: null,
      steps: null,
      target: null,
      filePath: card.filePath,
      entityId: card.entityId,
    }
  }

  if (!datasetQuery) {
    return {
      name: card.name,
      description: card.description,
      database: databaseName || null,
      cardType: card.cardType,
      queryType: queryType || null,
      nativeSql: null,
      datasetQuery: null,
      metadata: null,
      steps: null,
      target: null,
      filePath: card.filePath,
      entityId: card.entityId,
    }
  }

  const collector = new MetadataCollector(catalog)
  const rewrittenQuery = rewriteDatasetQuery(datasetQuery, collector)

  return {
    name: card.name,
    description: card.description,
    database: databaseName || null,
    cardType: card.cardType,
    queryType: "query",
    nativeSql: null,
    datasetQuery: rewrittenQuery,
    metadata: collector.toMetadata(),
    steps: null,
    target: null,
    filePath: card.filePath,
    entityId: card.entityId,
  }
}

export function buildNotebookDataFromTransform(
  transform: TransformNode,
  catalog: CatalogGraph | null,
): NotebookData {
  const raw = transform.raw
  const source = raw.source as Record<string, unknown> | undefined
  const queryWrapper = source?.query as Record<string, unknown> | undefined

  if (!queryWrapper) {
    return {
      name: transform.name,
      description: transform.description,
      database: transform.sourceDatabaseId,
      cardType: "transform",
      queryType: transform.sourceQueryType,
      nativeSql: null,
      datasetQuery: null,
      metadata: null,
      steps: null,
      target: buildTarget(raw),
      filePath: transform.filePath,
      entityId: transform.entityId,
    }
  }

  const queryType = String(queryWrapper.type ?? "query")

  if (queryType === "native" || queryType === "python") {
    const native = queryWrapper.native as Record<string, unknown> | undefined
    return {
      name: transform.name,
      description: transform.description,
      database: String(queryWrapper.database ?? ""),
      cardType: "transform",
      queryType,
      nativeSql: native ? String(native.query ?? "") : null,
      datasetQuery: null,
      metadata: null,
      steps: null,
      target: buildTarget(raw),
      filePath: transform.filePath,
      entityId: transform.entityId,
    }
  }

  const collector = new MetadataCollector(catalog)
  const rewrittenQuery = rewriteDatasetQuery(queryWrapper, collector)

  return {
    name: transform.name,
    description: transform.description,
    database: String(queryWrapper.database ?? ""),
    cardType: "transform",
    queryType: "query",
    nativeSql: null,
    datasetQuery: rewrittenQuery,
    metadata: collector.toMetadata(),
    steps: null,
    target: buildTarget(raw),
    filePath: transform.filePath,
    entityId: transform.entityId,
  }
}

function buildTarget(
  raw: Record<string, unknown>,
): NotebookData["target"] {
  const target = raw.target as Record<string, unknown> | undefined
  if (!target) return null

  return {
    database: String(target.database ?? ""),
    schema: String(target.schema ?? ""),
    name: String(target.name ?? ""),
  }
}
