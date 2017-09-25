import COSTS from 'metabase/xray/costs'

import {
    createAction,
    createThunkAction,
    handleActions
} from 'metabase/lib/redux'
import { BackgroundJobRequest/*, RestfulRequest*/ } from "metabase/lib/request";

import { XRayApi } from 'metabase/services'

// What follows is usage of RestfulRequest and BackgroundJobRequest which
// are interchangeable in terms of the method interface of the resulting object

// RestfulRequest for conventional REST API endpoints
// const tableXrayRequest = new RestfulRequest({
//     endpoint: XRayApi.table_xray,
//     resultPropName: 'xray',
//     actionPrefix: 'metabase/xray/table'
// })

// BackgroundJobRequest for
const tableXrayRequest = new BackgroundJobRequest({
    creationEndpoint: XRayApi.async_table_xray,
    statusEndpoint: XRayApi.async_status,
    resultPropName: 'xray',
    actionPrefix: 'metabase/xray/table'
})

export const INITIALIZE = 'metabase/xray/INITIALIZE'
export const initialize = createAction(INITIALIZE);

export const FETCH_FIELD_XRAY = 'metabase/xray/FETCH_FIELD_XRAY'
export const fetchFieldXray = createThunkAction(FETCH_FIELD_XRAY, (fieldId, cost) =>
    async (dispatch) => {
        dispatch(startLoad())
        try {
            const xray = await XRayApi.field_xray({ fieldId, ...cost.method })
            return dispatch(loadXray(xray))
        } catch (error) {
            console.error(error)
        }
    }
)

export const FETCH_TABLE_XRAY = 'metabase/xray/FETCH_TABLE_XRAY'
export const fetchTableXray = createThunkAction(FETCH_TABLE_XRAY, (tableId, cost) =>
    async (dispatch) => {
        try {
            await dispatch(tableXrayRequest.trigger({ tableId, ...cost.method }))
        } catch (error) {
            console.error(error)
        }
    }
)

export const FETCH_SEGMENT_XRAY = 'metabase/xray/FETCH_SEGMENT_XRAY'
export const fetchSegmentXray = createThunkAction(FETCH_SEGMENT_XRAY, (segmentId, cost) =>
    async (dispatch) => {
        dispatch(startLoad())
        try {
            const xray = await XRayApi.segment_xray({ segmentId, ...cost.method })
            return dispatch(loadXray(xray))
        } catch (error) {
            console.error(error)
        }
    }
)

export const FETCH_CARD_XRAY = 'metabase/xray/FETCH_CARD_XRAY';
export const fetchCardXray = createThunkAction(FETCH_CARD_XRAY, (cardId, cost) =>
    async (dispatch) => {
        const c = COSTS[cost]
        dispatch(startLoad())
        try {
            const xray = await XRayApi.card_xray({ cardId, ...c.method });
            dispatch(loadXray(xray));
            return false
        } catch (error) {
            console.error(error);
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
    ...tableXrayRequest.getReducers(),

    [INITIALIZE]: () => tableXrayRequest.getDefaultState(),
    [START_LOAD]: {
        next: (state, { payload }) => ({
            ...state,
            loading: true,
        })
    },
    [LOAD_XRAY]: {
        next: (state, { payload }) => ({
            ...state,
            xray: payload,
            loading: false,
            fetched: true
        })
    },
    [LOAD_COMPARISON]: {
        next: (state, { payload }) => ({
            ...state,
            comparison: payload,
            loading: false
        })
    },
    [XRAY_ERROR]: {
        next: (state, { payload }) => ({
            ...state,
            loading: false,
            error: payload
        })
    }
}, tableXrayRequest.getDefaultState())
