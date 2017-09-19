import { chain, assoc } from 'icepick'

import COSTS from 'metabase/xray/costs'

import {
    createAction,
    createThunkAction,
    handleActions
} from 'metabase/lib/redux'

import { XRayApi } from 'metabase/services'

export const FETCH_XRAY = 'metabase/xray/FETCH_XRAY'
export const fetchXray = createThunkAction(
    FETCH_XRAY,
    (
        type: string,
        id: number,
        cost: string
    ) =>
    async (dispatch) => {
        dispatch(startLoad())
        try {
            const c = COSTS[cost]
            const xray = await XRayApi[`${type}_xray`]({
                [`${type}Id`]: id,
                ...c.method
            })
            dispatch(loadXray(xray))
        } catch (error) {
            console.error(error)
            dispatch(xrayError(error))
        }
    }
)

export const FETCH_SEGMENT_COMPARISON = 'metabase/xray/FETCH_SEGMENT_COMPARISON';
export const fetchSegmentComparison = createThunkAction(
    FETCH_SEGMENT_COMPARISON,
    (segmentId1, segmentId2, cost) =>
        async (dispatch) => {
            const c = COSTS[cost]
            dispatch(startLoad())
            try {
                const comparison = await XRayApi.segment_compare({ segmentId1, segmentId2, ...c.method })
                return dispatch(loadComparison(comparison))
            } catch (error) {
                console.error(error)
                return dispatch(xrayError(error))
            }
        }
)

export const FETCH_SEGMENT_TABLE_COMPARISON = 'metabase/xray/FETCH_SEGMENT_COMPARISON';
export const fetchSegmentTableComparison = createThunkAction(
    FETCH_SEGMENT_TABLE_COMPARISON,
    (segmentId, tableId, cost) =>
        async (dispatch) => {
            const c = COSTS[cost]
            dispatch(startLoad())
            try {
                const comparison = await XRayApi.segment_table_compare({ segmentId, tableId, ...c.method })
                return dispatch(loadComparison(comparison))
            } catch (error) {
                console.error(error)
                return dispatch(xrayError(error))
            }
        }
)

export const START_LOAD = 'metabase/xray/START_LOAD'
export const startLoad = createAction(START_LOAD)

export const LOAD_XRAY = 'metabase/xray/LOAD_XRAY'
export const loadXray = createAction(LOAD_XRAY)

export const LOAD_COMPARISON = 'metabase/xray/LOAD_COMPARISON'
export const loadComparison = createAction(LOAD_COMPARISON)

export const XRAY_ERROR = 'metabase/xray/XRAY_ERROR'
export const xrayError = createAction(XRAY_ERROR)

export default handleActions({
    [START_LOAD]: {
        next: (state, { payload }) => assoc(state, 'loading', true)
    },
    [LOAD_XRAY]: {
        next: (state, { payload }) =>
            chain(state)
                .assoc('xray', payload)
                .assoc('loading', false)
                .value()
    },
    [LOAD_COMPARISON]: {
        next: (state, { payload }) =>
            chain(state)
                .assoc('comparison', payload)
                .assoc('loading', false)
                .value()
    },
    [XRAY_ERROR]: {
        next: (state, { payload }) =>
            chain(state)
                .assoc('loading', false)
                .assoc('error', payload)
                .value()
    }

}, {
    loading: false,
    error: null,
})
