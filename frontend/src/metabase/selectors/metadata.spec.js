import Metadata from 'metabase-lib/lib/metadata/Metadata'
import Database from 'metabase-lib/lib/metadata/Database'

import {
    metadata, // connected graph,
    state, // the original non connected metadata objects,
    DATABASE_ID,
    MAIN_TABLE_ID,
    MAIN_DATE_FIELD_ID,
    NUM_DBS,
    NUM_TABLES,
    NUM_METRICS,
    NUM_FIELDS,
    NUM_SEGMENTS
} from 'metabase/__support__/fixtures'

import { copyObjects } from './metadata'


describe('getMetadata', () => {
    it('should properly transfer metadata', () => {
        expect(metadata).toBeInstanceOf(Metadata)

        expect(Object.keys(metadata.databases).length).toEqual(NUM_DBS)
        expect(Object.keys(metadata.tables).length).toEqual(NUM_TABLES)
        expect(Object.keys(metadata.fields).length).toEqual(NUM_FIELDS)
        expect(Object.keys(metadata.metrics).length).toEqual(NUM_METRICS)
        expect(Object.keys(metadata.segments).length).toEqual(NUM_SEGMENTS)
    })

    describe('connected database', () => {
        it('should have the proper number of tables', () => {
            const database = metadata.databases[DATABASE_ID]
            expect(database.tables.length).toEqual(NUM_TABLES)
        })
    })

    describe('connected table', () => {
        const table = metadata.tables[MAIN_TABLE_ID]

        it('should have the proper number of fields', () => {
            // TODO - make this more dynamic
            expect(table.fields.length).toEqual(5)
        })

        it('should have a parent database', () => {
            expect(table.database).toEqual(metadata.databases[DATABASE_ID])
        })
    })

    describe('connected field', () => {
        const field = metadata.fields[MAIN_DATE_FIELD_ID]
        it('should have a parent table', () => {
            expect(field.table).toEqual(metadata.tables[MAIN_TABLE_ID])
        })
    })
})

describe('hydrate', () => {
})

describe('copyObjects', () => {
    it('should clone each object in the provided mapping of objects', () => {
        const meta = new Metadata()
        const databases = state.metadata.databases
        const copiedDatabases = copyObjects(meta, databases, Database)

        expect(Object.keys(copiedDatabases).length).toEqual(NUM_DBS)

        Object.values(copiedDatabases).map(db => {
            expect(db).toBeInstanceOf(Database)
            expect(db).toHaveProperty('metadata')
            expect(db.metadata).toBeInstanceOf(Metadata)
        })
    })
})

