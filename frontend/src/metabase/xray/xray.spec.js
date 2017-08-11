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
