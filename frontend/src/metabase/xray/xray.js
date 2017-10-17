import COSTS from 'metabase/xray/costs'

import {
    createAction,
    createThunkAction,
    handleActions
} from 'metabase/lib/redux'
import { BackgroundJobRequest/*, RestfulRequest*/ } from "metabase/lib/request";

import { XRayApi } from 'metabase/services'

export const INITIALIZE = 'metabase/xray/INITIALIZE'
export const initialize = createAction(INITIALIZE);

export const FETCH_FIELD_XRAY = 'metabase/xray/FETCH_FIELD_XRAY'
const fieldXrayRequest = new BackgroundJobRequest({
    creationEndpoint: XRayApi.field_xray,
    resultPropName: 'xray',
    actionPrefix: FETCH_FIELD_XRAY
})
export const fetchFieldXray = createThunkAction(FETCH_FIELD_XRAY, (fieldId, cost) =>
    (dispatch) =>
        dispatch(fieldXrayRequest.trigger({ fieldId, ...COSTS[cost].method }))
)

export const FETCH_TABLE_XRAY = 'metabase/xray/FETCH_TABLE_XRAY'
const tableXrayRequest = new BackgroundJobRequest({
    creationEndpoint: XRayApi.table_xray,
    resultPropName: 'xray',
    actionPrefix: FETCH_TABLE_XRAY
})
export const fetchTableXray = createThunkAction(FETCH_TABLE_XRAY, (tableId, cost) =>
    (dispatch) =>
        dispatch(tableXrayRequest.trigger({ tableId, ...COSTS[cost].method }))
)

export const FETCH_SEGMENT_XRAY = 'metabase/xray/FETCH_SEGMENT_XRAY'
const segmentXrayRequest = new BackgroundJobRequest({
    creationEndpoint: XRayApi.segment_xray,
    resultPropName: 'xray',
    actionPrefix: FETCH_SEGMENT_XRAY
})
export const fetchSegmentXray = createThunkAction(FETCH_SEGMENT_XRAY, (segmentId, cost) =>
    (dispatch) =>
        dispatch(segmentXrayRequest.trigger({ segmentId, ...COSTS[cost].method }))
)

export const FETCH_CARD_XRAY = 'metabase/xray/FETCH_CARD_XRAY';
const cardXrayRequest = new BackgroundJobRequest({
    creationEndpoint: XRayApi.card_xray,
    resultPropName: 'xray',
    actionPrefix: FETCH_CARD_XRAY
})
export const fetchCardXray = createThunkAction(FETCH_CARD_XRAY, (cardId, cost) =>
    (dispatch) =>
        dispatch(cardXrayRequest.trigger({ cardId, ...COSTS[cost].method }))
)

export const FETCH_SEGMENT_COMPARISON = 'metabase/xray/FETCH_SEGMENT_COMPARISON';
const segmentComparisonXrayRequest = new BackgroundJobRequest({
    creationEndpoint: XRayApi.segment_compare,
    resultPropName: 'comparison',
    actionPrefix: FETCH_SEGMENT_COMPARISON
})
export const fetchSegmentComparison = createThunkAction(FETCH_SEGMENT_COMPARISON, (segmentId1, segmentId2, cost) =>
    (dispatch) =>
        dispatch(segmentComparisonXrayRequest.trigger({ segmentId1, segmentId2, ...COSTS[cost].method }))
)


export const FETCH_SEGMENT_TABLE_COMPARISON = 'metabase/xray/FETCH_SEGMENT_COMPARISON';
const segmentTableComparisonXrayRequest = new BackgroundJobRequest({
    creationEndpoint: XRayApi.segment_table_compare,
    resultPropName: 'comparison',
    actionPrefix: FETCH_SEGMENT_TABLE_COMPARISON
})
export const fetchSegmentTableComparison = createThunkAction(FETCH_SEGMENT_TABLE_COMPARISON, (segmentId, tableId, cost) =>
    (dispatch) =>
        dispatch(segmentTableComparisonXrayRequest.trigger({ segmentId, tableId, ...COSTS[cost].method }))
)

export const FETCH_TABLE_COMPARISON = 'metabase/xray/FETCH_TABLE_COMPARISON';
const tableComparisonXrayRequest = new BackgroundJobRequest({
    creationEndpoint: XRayApi.table_compare,
    resultPropName: 'comparison',
    actionPrefix: FETCH_TABLE_COMPARISON
})
export const fetchTableComparison = createThunkAction(FETCH_TABLE_COMPARISON, (tableId1, tableId2, cost) =>
    (dispatch) =>
        dispatch(tableComparisonXrayRequest.trigger({ tableId1, tableId2, ...COSTS[cost].method }))
)

export default handleActions({
    ...fieldXrayRequest.getReducers(),
    ...tableXrayRequest.getReducers(),
    ...segmentXrayRequest.getReducers(),
    ...cardXrayRequest.getReducers(),
    ...segmentComparisonXrayRequest.getReducers(),
    ...segmentTableComparisonXrayRequest.getReducers(),
    [INITIALIZE]: () => tableXrayRequest.getDefaultState(),
}, tableXrayRequest.getDefaultState())
