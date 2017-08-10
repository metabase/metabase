import configureMockStore from 'redux-mock-store'
import thunk from 'redux-thunk'
import nock from 'nock'

const middlewares = [thunk]
const mockStore = configureMockStore(middlewares)

import reducer, {
    fetchSegmentComparison,
    loadComparison
} from 'metabase/xray/xray'

import { getComparison } from 'metabase/xray/selectors'

describe('xray', () => {
    describe('xray reducer', () => {
        describe('load comparison', () => {
            it('should properly load a comparison', () => {
                const action = loadComparison({
                    features: {}
                })

                const expected = {
                    comparison: {
                        features: {}
                    }
                }

                expect(reducer({}, action)).toEqual(expected)
            })
        })

        describe('fetch segment comparison', () => {
            it('should properly fetch and load a comparison', async () => {
                const store = mockStore({})

                const mockComparison = ({ features: {}})

                nock.disableNetConnect()
                nock.enableNetConnect('127.0.0.1')

                nock('https://localhost:3000/')
                    .get(/api$/)
                    .reply(200, {})

                const dispatched = await store.dispatch(
                    fetchSegmentComparison(1, 2)
                )

                const expectedActions = [
                    loadComparison(mockComparison)
                ]

                const actions = store.getActions()
                console.log(actions)

                expect(actions).toEqual(expectedActions)

            })
        })
    })

    describe('xray selectors', () => {
        describe('getComparison', () => {
            it('should properly return a comparison', () => {
                const comparison = {
                    features: {}
                }

                const state = {
                    xray: {
                        comparison,
                        xray: {}
                    }
                }

                expect(getComparison(state)).toEqual(comparison)
            })
        })
    })
})
