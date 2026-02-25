import type { CardNode, TransformNode, TableNode, FieldNode } from "./types"
import type { CatalogGraph } from "./catalog-graph"
import type { NotebookData, NotebookStepData, NotebookClauseData } from "../shared-types"

/**
 * Builds NotebookData from a CardNode (metric/model/question) for rendering
 * in the ReadOnlyNotebook webview.
 *
 * The YAML uses symbolic names (["neondb", "public", "orders"]) which we parse
 * directly to produce display-friendly step data without needing metabase-lib CLJS.
 */
export function buildNotebookDataFromCard(
  card: CardNode,
  catalog: CatalogGraph | null,
): NotebookData {
  const raw = card.raw
  const datasetQuery = raw.dataset_query as Record<string, unknown> | undefined
  const resultMetadata = raw.result_metadata as Record<string, unknown>[] | undefined

  const database = datasetQuery
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
      database: database ? String(database) : null,
      cardType: card.cardType,
      queryType: "native",
      nativeSql: native ? String(native.query ?? "") : null,
      steps: null,
      target: null,
      filePath: card.filePath,
      entityId: card.entityId,
    }
  }

  const query = (datasetQuery as Record<string, unknown>)?.query as Record<string, unknown> | undefined
  const steps = query ? buildStructuredSteps(query, catalog) : []

  return {
    name: card.name,
    description: card.description,
    database: database ? String(database) : null,
    cardType: card.cardType,
    queryType: "query",
    nativeSql: null,
    steps,
    target: null,
    filePath: card.filePath,
    entityId: card.entityId,
  }
}

/**
 * Builds NotebookData from a TransformNode for rendering in the ReadOnlyNotebook webview.
 */
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
      steps: null,
      target: buildTarget(raw),
      filePath: transform.filePath,
      entityId: transform.entityId,
    }
  }

  const database = String(queryWrapper.database ?? "")
  const queryType = String(queryWrapper.type ?? "query")

  if (queryType === "native") {
    const native = queryWrapper.native as Record<string, unknown> | undefined
    return {
      name: transform.name,
      description: transform.description,
      database,
      cardType: "transform",
      queryType: "native",
      nativeSql: native ? String(native.query ?? "") : null,
      steps: null,
      target: buildTarget(raw),
      filePath: transform.filePath,
      entityId: transform.entityId,
    }
  }

  if (queryType === "python") {
    const native = queryWrapper.native as Record<string, unknown> | undefined
    return {
      name: transform.name,
      description: transform.description,
      database,
      cardType: "transform",
      queryType: "python",
      nativeSql: native ? String(native.query ?? "") : null,
      steps: null,
      target: buildTarget(raw),
      filePath: transform.filePath,
      entityId: transform.entityId,
    }
  }

  const query = queryWrapper.query as Record<string, unknown> | undefined
  const steps = query ? buildStructuredSteps(query, catalog) : []

  return {
    name: transform.name,
    description: transform.description,
    database,
    cardType: "transform",
    queryType: "query",
    nativeSql: null,
    steps,
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

function buildStructuredSteps(
  query: Record<string, unknown>,
  catalog: CatalogGraph | null,
): NotebookStepData[] {
  const steps: NotebookStepData[] = []

  // Data step (source table)
  const sourceTable = query["source-table"]
  if (sourceTable) {
    const tableDisplay = formatSourceTable(sourceTable)
    const tableRef = Array.isArray(sourceTable)
      ? sourceTable.map(String).slice(0, 3)
      : null

    steps.push({
      type: "data",
      title: tableDisplay,
      clauses: [
        {
          displayName: tableDisplay,
          fieldRef: tableRef,
        },
      ],
    })
  }

  // Joins
  const joins = query.joins as unknown[] | undefined
  if (Array.isArray(joins) && joins.length > 0) {
    for (const join of joins) {
      const joinObj = join as Record<string, unknown>
      const joinSourceTable = joinObj["source-table"]
      const joinAlias = joinObj.alias ? String(joinObj.alias) : null
      const tableDisplay = formatSourceTable(joinSourceTable)
      const label = joinAlias ?? tableDisplay

      steps.push({
        type: "join",
        title: `Join: ${label}`,
        clauses: [
          {
            displayName: tableDisplay,
            fieldRef: Array.isArray(joinSourceTable)
              ? joinSourceTable.map(String).slice(0, 3)
              : null,
          },
        ],
      })
    }
  }

  // Expressions (custom columns)
  const expressions = query.expressions as Record<string, unknown> | undefined
  if (expressions && typeof expressions === "object") {
    const expressionNames = Object.keys(expressions)
    if (expressionNames.length > 0) {
      steps.push({
        type: "expression",
        title: null,
        clauses: expressionNames.map((name) => ({
          displayName: name,
          fieldRef: null,
        })),
      })
    }
  }

  // Filters
  const filter = query.filter
  if (filter) {
    const filterClauses = parseFilterClauses(filter, catalog)
    if (filterClauses.length > 0) {
      steps.push({
        type: "filter",
        title: null,
        clauses: filterClauses,
      })
    }
  }

  // Aggregations + Breakouts → Summarize step
  const aggregation = query.aggregation
  const breakout = query.breakout

  const aggregationClauses = aggregation
    ? parseAggregationClauses(aggregation)
    : []
  const breakoutClauses = breakout ? parseBreakoutClauses(breakout) : []

  if (aggregationClauses.length > 0) {
    steps.push({
      type: "summarize",
      title: null,
      clauses: aggregationClauses,
    })
  }

  if (breakoutClauses.length > 0) {
    steps.push({
      type: "breakout",
      title: null,
      clauses: breakoutClauses,
    })
  }

  // Sort
  const orderBy = query["order-by"]
  if (Array.isArray(orderBy) && orderBy.length > 0) {
    steps.push({
      type: "sort",
      title: null,
      clauses: orderBy.filter(Array.isArray).map((clause: unknown[]) => {
        const direction = String(clause[0] ?? "asc")
        const field = extractFieldDisplay(clause[1])
        const dirLabel = direction === "desc" ? " (descending)" : " (ascending)"
        return {
          displayName: field.display + dirLabel,
          fieldRef: field.ref,
        }
      }),
    })
  }

  // Limit
  if (typeof query.limit === "number") {
    steps.push({
      type: "limit",
      title: null,
      clauses: [
        {
          displayName: String(query.limit),
          fieldRef: null,
        },
      ],
    })
  }

  return steps
}

function formatSourceTable(sourceTable: unknown): string {
  if (Array.isArray(sourceTable)) {
    const parts = sourceTable.map(String)
    if (parts.length >= 3) {
      return `${parts[1]}.${parts[2]}`
    }
    return parts.join(".")
  }
  return String(sourceTable ?? "unknown")
}

function extractFieldDisplay(
  fieldRef: unknown,
): { display: string; ref: string[] | null } {
  if (!Array.isArray(fieldRef)) {
    return { display: String(fieldRef ?? "?"), ref: null }
  }

  // ["field", [db, schema, table, column], opts]
  if (fieldRef[0] === "field" && Array.isArray(fieldRef[1])) {
    const parts = fieldRef[1].map(String)
    if (parts.length >= 4) {
      return { display: parts[3], ref: parts }
    }
    return { display: parts.join("."), ref: parts.length >= 3 ? parts : null }
  }

  // ["field", columnName, opts]
  if (fieldRef[0] === "field" && typeof fieldRef[1] === "string") {
    return { display: fieldRef[1], ref: null }
  }

  // ["expression", expressionName]
  if (fieldRef[0] === "expression" && typeof fieldRef[1] === "string") {
    return { display: fieldRef[1], ref: null }
  }

  // ["aggregation", index]
  if (fieldRef[0] === "aggregation") {
    return { display: `Aggregation ${fieldRef[1]}`, ref: null }
  }

  return { display: String(fieldRef), ref: null }
}

function parseFilterClauses(
  filter: unknown,
  _catalog: CatalogGraph | null,
): NotebookClauseData[] {
  if (!Array.isArray(filter)) return []

  // Single filter: ["=", ["field", ...], value]
  if (typeof filter[0] === "string" && filter[0] !== "and" && filter[0] !== "or") {
    const parsed = formatSingleFilter(filter)
    return parsed ? [parsed] : []
  }

  // Compound: ["and", filter1, filter2, ...]
  if (filter[0] === "and" || filter[0] === "or") {
    return filter
      .slice(1)
      .map((subFilter: unknown) =>
        Array.isArray(subFilter) ? formatSingleFilter(subFilter) : null,
      )
      .filter((result): result is NotebookClauseData => result !== null)
  }

  return []
}

function formatSingleFilter(filter: unknown[]): NotebookClauseData | null {
  if (filter.length < 2) return null

  const operator = String(filter[0])
  const field = extractFieldDisplay(filter[1])
  const value = filter.length > 2 ? formatFilterValue(filter.slice(2)) : ""

  const displayName = value
    ? `${field.display} ${operator} ${value}`
    : `${field.display} ${operator}`

  return {
    displayName,
    fieldRef: field.ref,
  }
}

function formatFilterValue(values: unknown[]): string {
  if (values.length === 1) {
    const value = values[0]
    if (value === null || value === undefined) return "null"
    if (Array.isArray(value)) return value.map(String).join(", ")
    return String(value)
  }
  return values.map(String).join(", ")
}

function parseAggregationClauses(aggregation: unknown): NotebookClauseData[] {
  if (!Array.isArray(aggregation)) return []

  // Single aggregation: ["count"] or ["sum", ["field", ...]]
  if (typeof aggregation[0] === "string") {
    return [formatSingleAggregation(aggregation)]
  }

  // Multiple: [["count"], ["sum", ["field", ...]]]
  return aggregation
    .filter(Array.isArray)
    .map((agg: unknown[]) => formatSingleAggregation(agg))
}

function formatSingleAggregation(aggregation: unknown[]): NotebookClauseData {
  const operator = String(aggregation[0])
  if (aggregation.length > 1) {
    const field = extractFieldDisplay(aggregation[1])
    return {
      displayName: `${operator} of ${field.display}`,
      fieldRef: field.ref,
    }
  }
  return {
    displayName: operator,
    fieldRef: null,
  }
}

function parseBreakoutClauses(breakout: unknown): NotebookClauseData[] {
  if (!Array.isArray(breakout)) return []
  return breakout.map((item: unknown) => {
    if (Array.isArray(item)) {
      const field = extractFieldDisplay(item)
      return {
        displayName: field.display,
        fieldRef: field.ref,
      }
    }
    return {
      displayName: String(item),
      fieldRef: null,
    }
  })
}
