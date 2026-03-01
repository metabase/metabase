import type { OutputChannel } from 'vscode'

import type { TableSchemaResult } from './metabase-client'

export class TableMetadataCache {
  private cache = new Map<number, TableSchemaResult>()
  private log: OutputChannel | undefined

  constructor(log?: OutputChannel) {
    this.log = log
  }

  /** Get a cached schema if it exists. */
  get(tableId: number): TableSchemaResult | undefined {
    const entry = this.cache.get(tableId)
    if (!entry) {
      return undefined
    }

    this.log?.appendLine(`tableMetadataCache: cache hit for table ${tableId}`)
    return entry
  }

  /** Store a schema result in the cache. */
  set(tableId: number, schema: TableSchemaResult): void {
    this.log?.appendLine(`tableMetadataCache: caching schema for table ${tableId} (${schema.fields.length} fields)`)
    this.cache.set(tableId, schema)
  }

  /** Invalidate a single table entry. */
  invalidate(tableId: number): void {
    if (this.cache.delete(tableId)) {
      this.log?.appendLine(`tableMetadataCache: invalidated table ${tableId}`)
    }
  }

  /** Clear the entire cache. */
  clear(): void {
    const size = this.cache.size
    this.cache.clear()
    this.log?.appendLine(`tableMetadataCache: cleared ${size} entries`)
  }

  /** Return the set of field names for a cached table, or undefined if not cached. */
  getFieldNames(tableId: number): Set<string> | undefined {
    const schema = this.cache.get(tableId)
    if (!schema)
      return undefined
    return new Set(schema.fields.map(f => f.name))
  }

  /** Number of entries currently cached. */
  get size(): number {
    return this.cache.size
  }
}
