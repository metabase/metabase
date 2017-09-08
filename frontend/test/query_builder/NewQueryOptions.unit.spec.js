import React from 'react'
import { mount } from 'enzyme'

import sinon from 'sinon'

import { NewQueryOptions } from 'metabase/new_query/containers/NewQueryOptions'

import NewQueryOption from "metabase/new_query/components/NewQueryOption";

import { state, DATABASE_ID } from "../__support__/sample_dataset_fixture";

const DB = state.metadata.databases[DATABASE_ID]

const ACCESSIBLE_SQL_DB = {
    ...DB,
    native_permissions: "write"
}

const METADATA = {
    metrics: {},
    segments: {},
    databases: {
        [DATABASE_ID]: ACCESSIBLE_SQL_DB
    },
    databasesList: () => [ACCESSIBLE_SQL_DB],
    segmentsList: () => [],
    metricsList: () => [],
}

const mockFn = () => Promise.resolve({})

describe('New Query Options', () => {
    describe('a non admin on a fresh instance', () => {
        describe('with SQL access on a single DB', () => {
            it('should show the SQL option', (done) => {

                sinon.spy(NewQueryOptions.prototype, 'determinePaths')

                const wrapper = mount(
                    <NewQueryOptions
                        isAdmin={false}
                        query={{}}
                        metadataFetched={{
                            databases: true,
                            metrics: true,
                            segments: true
                        }}
                        metadata={METADATA}
                        fetchDatabases={mockFn}
                        fetchMetrics={mockFn}
                        fetchSegments={mockFn}
                        resetQuery={mockFn}
                        getUrlForQuery={() => 'query'}
                        push={() => {} }
                    />
                )

                setImmediate(() => {
                    expect(NewQueryOptions.prototype.determinePaths.calledOnce).toEqual(true)
                    expect(wrapper.find(NewQueryOption).length).toEqual(2)
                    done()
                })
            })
        })

        describe('with no SQL access', () => {
            it('should redirect', (done) => {
                const mockedPush = sinon.spy()
                const mockQueryUrl = 'query'

                mount(
                    <NewQueryOptions
                        isAdmin={false}
                        query={{}}
                        metadataFetched={{
                            databases: true,
                            metrics: true,
                            segments: true
                        }}
                        metadata={{
                            ...METADATA,
                            databases: {},
                            databasesList: () => []
                        }}
                        fetchDatabases={mockFn}
                        fetchMetrics={mockFn}
                        fetchSegments={mockFn}
                        resetQuery={mockFn}
                        push={mockedPush}
                        getUrlForQuery={() => mockQueryUrl}
                    />
                )

                setImmediate(() => {
                    expect(mockedPush.called).toEqual(true)
                    expect(mockedPush.calledWith(mockQueryUrl)).toEqual(true)
                    done()
                })
            })
        })
    })
})

