import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadMetabaseExport, validateConsistency } from '../src/metabase-lib'

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/hackathon-sync')

describe('metabase-lib', () => {
  describe('loadMetabaseExport', () => {
    it('parses the Hackathon-Sync directory', async () => {
      const { catalog, content } = await loadMetabaseExport(FIXTURE_PATH)

      expect(catalog.databases.length).toBeGreaterThanOrEqual(2)
      expect(content.allCollections.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('CatalogGraph', () => {
    it('builds the database → schema → table → field hierarchy', async () => {
      const { catalog } = await loadMetabaseExport(FIXTURE_PATH)

      const neondb = catalog.getDatabase('neondb')
      expect(neondb).toBeDefined()
      expect(neondb!.schemas.length).toBeGreaterThanOrEqual(1)

      const publicSchema = neondb!.schemas.find(schema => schema.name === 'public')
      expect(publicSchema).toBeDefined()
      expect(publicSchema!.tables.length).toBeGreaterThanOrEqual(6)

      const categories = publicSchema!.tables.find(table => table.name === 'categories')
      expect(categories).toBeDefined()
      expect(categories!.fields.length).toBeGreaterThanOrEqual(1)
      expect(categories!.displayName).toBe('Categories')
    })

    it('resolves table refs', async () => {
      const { catalog } = await loadMetabaseExport(FIXTURE_PATH)
      const table = catalog.resolveTableRef(['neondb', 'public', 'orders'])
      expect(table).toBeDefined()
      expect(table!.name).toBe('orders')
    })

    it('resolves field refs', async () => {
      const { catalog } = await loadMetabaseExport(FIXTURE_PATH)
      const field = catalog.resolveFieldRef(['neondb', 'public', 'categories', 'id'])
      expect(field).toBeDefined()
      expect(field!.semanticType).toBe('type/PK')
    })

    it('detects foreign keys', async () => {
      const { catalog } = await loadMetabaseExport(FIXTURE_PATH)
      const foreignKeys = catalog.foreignKeys
      expect(foreignKeys.length).toBeGreaterThanOrEqual(1)

      const resolvedForeignKeys = foreignKeys.filter(fk => fk.target !== undefined)
      expect(resolvedForeignKeys.length).toBeGreaterThanOrEqual(1)
    })

    it('sorts fields by position', async () => {
      const { catalog } = await loadMetabaseExport(FIXTURE_PATH)
      for (const table of catalog.allTables) {
        for (let index = 1; index < table.fields.length; index++) {
          expect(table.fields[index].position).toBeGreaterThanOrEqual(table.fields[index - 1].position)
        }
      }
    })

    it('attaches measures and segments to tables', async () => {
      const { catalog } = await loadMetabaseExport(FIXTURE_PATH)
      const tablesWithMeasures = catalog.allTables.filter(table => table.measures.length > 0)
      const tablesWithSegments = catalog.allTables.filter(table => table.segments.length > 0)
      expect(tablesWithMeasures.length).toBeGreaterThanOrEqual(1)
      expect(tablesWithSegments.length).toBeGreaterThanOrEqual(1)
    })

    it('provides tree traversal via getChildren', async () => {
      const { catalog } = await loadMetabaseExport(FIXTURE_PATH)
      const roots = catalog.getRoots()
      expect(roots.length).toBeGreaterThanOrEqual(2)

      for (const database of roots) {
        const schemas = catalog.getChildren(database)
        expect(schemas.length).toBeGreaterThanOrEqual(1)
        for (const schema of schemas) {
          const tables = catalog.getChildren(schema)
          expect(tables.length).toBeGreaterThanOrEqual(1)
        }
      }
    })
  })

  describe('ContentGraph', () => {
    it('builds the collection hierarchy', async () => {
      const { content } = await loadMetabaseExport(FIXTURE_PATH)
      const roots = content.rootCollections
      expect(roots.length).toBeGreaterThanOrEqual(1)

      const library = roots.find(collection => collection.collectionType === 'library')
      expect(library).toBeDefined()
      expect(library!.children.length).toBeGreaterThanOrEqual(1)
    })

    it('attaches cards to collections', async () => {
      const { content } = await loadMetabaseExport(FIXTURE_PATH)
      expect(content.allCards.length).toBeGreaterThanOrEqual(1)

      const collectionsWithCards = content.allCollections.filter(collection => collection.cards.length > 0)
      expect(collectionsWithCards.length).toBeGreaterThanOrEqual(1)
    })

    it('indexes transforms', async () => {
      const { content } = await loadMetabaseExport(FIXTURE_PATH)
      expect(content.transforms.length).toBeGreaterThanOrEqual(1)
    })

    it('provides tree traversal via getRoots and getChildren', async () => {
      const { content } = await loadMetabaseExport(FIXTURE_PATH)
      const roots = content.getRoots()
      expect(roots.length).toBeGreaterThanOrEqual(1)

      for (const root of roots) {
        const children = content.getChildren(root)
        if (root.kind === 'collection') {
          expect(children.length).toBeGreaterThanOrEqual(0)
        }
      }
    })

    it('lookups by entity id work', async () => {
      const { content } = await loadMetabaseExport(FIXTURE_PATH)
      for (const card of content.allCards) {
        expect(content.getCard(card.entityId)).toBe(card)
      }
      for (const collection of content.allCollections) {
        expect(content.getCollection(collection.entityId)).toBe(collection)
      }
    })
  })

  describe('validateConsistency', () => {
    it('returns issues array', async () => {
      const { catalog, content } = await loadMetabaseExport(FIXTURE_PATH)
      const issues = validateConsistency(catalog, content)
      expect(Array.isArray(issues)).toBe(true)

      for (const issue of issues) {
        expect(issue.severity).toMatch(/^(error|warning)$/)
        expect(issue.filePath).toBeTruthy()
        expect(issue.entityKind).toBeTruthy()
        expect(issue.referenceType).toBeTruthy()
      }
    })
  })
})
