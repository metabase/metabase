import type { DatabaseEntity, ParsedEntities } from './parser'
import type {
  CatalogNode,
  DatabaseNode,
  FieldNode,
  FieldRef,
  SchemaNode,
  TableNode,
  TableRef,
} from './types'

function refKey(parts: readonly (string | null)[]): string {
  return parts.map(part => part ?? '').join('\0')
}

export class CatalogGraph {
  private databaseIndex = new Map<string, DatabaseNode>()
  private tableIndex = new Map<string, TableNode>()
  private fieldIndex = new Map<string, FieldNode>()

  get databases(): DatabaseNode[] {
    return [...this.databaseIndex.values()]
  }

  get allTables(): TableNode[] {
    return [...this.tableIndex.values()]
  }

  get allFields(): FieldNode[] {
    return [...this.fieldIndex.values()]
  }

  getDatabase(name: string): DatabaseNode | undefined {
    return this.databaseIndex.get(name)
  }

  getTable(databaseName: string, schemaName: string | null, tableName: string): TableNode | undefined {
    return this.tableIndex.get(refKey([databaseName, schemaName, tableName]))
  }

  getField(databaseName: string, schemaName: string | null, tableName: string, fieldName: string): FieldNode | undefined {
    return this.fieldIndex.get(refKey([databaseName, schemaName, tableName, fieldName]))
  }

  resolveTableRef(ref: TableRef): TableNode | undefined {
    return this.tableIndex.get(refKey(ref))
  }

  resolveFieldRef(ref: FieldRef): FieldNode | undefined {
    // Field hierarchies: [db, schema, table, parentField, childField, ...]
    // The leaf field (last element) is what we index by
    const [database, schema, table] = ref
    const leafFieldName = ref[ref.length - 1]
    return this.fieldIndex.get(refKey([database, schema, table, leafFieldName]))
  }

  getRoots(): DatabaseNode[] {
    return this.databases
  }

  getChildren(node: CatalogNode): CatalogNode[] {
    switch (node.kind) {
      case 'database': return node.schemas
      case 'schema': return node.tables
      case 'table': return [...node.fields, ...node.measures, ...node.segments]
      default: return []
    }
  }

  get foreignKeys(): Array<{ source: FieldNode, target: FieldNode | undefined }> {
    return this.allFields
      .filter(field => field.fkTargetFieldRef !== null)
      .map(field => ({
        source: field,
        target: field.fkTargetFieldRef ? this.resolveFieldRef(field.fkTargetFieldRef) : undefined,
      }))
  }

  private ensureDatabase(name: string, entity?: DatabaseEntity): DatabaseNode {
    let database = this.databaseIndex.get(name)
    if (!database) {
      database = {
        kind: 'database',
        name,
        engine: entity?.engine ?? null,
        description: entity?.description ?? null,
        schemas: [],
        filePath: entity?.filePath ?? null,
        raw: entity?.raw ?? null,
      }
      this.databaseIndex.set(name, database)
    }
    else if (entity && !database.filePath) {
      database.engine = entity.engine
      database.description = entity.description
      database.filePath = entity.filePath
      database.raw = entity.raw
    }
    return database
  }

  static build(entities: ParsedEntities): CatalogGraph {
    const graph = new CatalogGraph()
    const schemaIndex = new Map<string, SchemaNode>()

    for (const databaseEntity of entities.databases) {
      graph.ensureDatabase(databaseEntity.name, databaseEntity)
    }

    for (const table of entities.tables) {
      const database = graph.ensureDatabase(table.databaseName)

      const schemaKey = refKey([table.databaseName, table.schemaName])
      if (!schemaIndex.has(schemaKey)) {
        const schema: SchemaNode = {
          kind: 'schema',
          name: table.schemaName,
          databaseName: table.databaseName,
          tables: [],
        }
        schemaIndex.set(schemaKey, schema)
        database.schemas.push(schema)
      }

      schemaIndex.get(schemaKey)!.tables.push(table)

      const tableKey = refKey([table.databaseName, table.schemaName, table.name])
      graph.tableIndex.set(tableKey, table)
    }

    for (const field of entities.fields) {
      const tableKey = refKey([field.databaseName, field.schemaName, field.tableName])
      const table = graph.tableIndex.get(tableKey)
      if (table) {
        table.fields.push(field)
      }
      const fieldKey = refKey([field.databaseName, field.schemaName, field.tableName, field.name])
      graph.fieldIndex.set(fieldKey, field)
    }

    for (const measure of entities.measures) {
      const tableKey = refKey([measure.databaseName, measure.schemaName, measure.tableName])
      graph.tableIndex.get(tableKey)?.measures.push(measure)
    }

    for (const segment of entities.segments) {
      const tableKey = refKey([segment.databaseName, segment.schemaName, segment.tableName])
      graph.tableIndex.get(tableKey)?.segments.push(segment)
    }

    for (const table of graph.tableIndex.values()) {
      table.fields.sort((fieldA, fieldB) => fieldA.position - fieldB.position)
      table.measures.sort((measureA, measureB) => measureA.name.localeCompare(measureB.name))
      table.segments.sort((segmentA, segmentB) => segmentA.name.localeCompare(segmentB.name))
    }
    for (const database of graph.databaseIndex.values()) {
      database.schemas.sort((schemaA, schemaB) => schemaA.name.localeCompare(schemaB.name))
      for (const schema of database.schemas) {
        schema.tables.sort((tableA, tableB) => tableA.name.localeCompare(tableB.name))
      }
    }

    return graph
  }
}
