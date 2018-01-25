import COSTS from 'metabase/xray/costs'

import {
    createAction,
    createThunkAction,
    handleActions
} from 'metabase/lib/redux'
import { BackgroundJobRequest } from "metabase/lib/request";

import { XRayApi } from 'metabase/services'
import Question from "metabase-lib/lib/Question";

export const INITIALIZE = 'metabase/xray/INITIALIZE'
export const initialize = createAction(INITIALIZE);
export const SET_XRAY_ERROR = 'metabase/xray/SET_XRAY_ERROR'
export const setXrayError = createAction(SET_XRAY_ERROR)

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

export const FETCH_UNSAVED_CARD_XRAY = 'metabase/xray/FETCH_UNSAVED_CARD_XRAY';
const unsavedCardXrayRequest = new BackgroundJobRequest({
    creationEndpoint: XRayApi.unsaved_card_xray,
    resultPropName: 'xray',
    actionPrefix: FETCH_UNSAVED_CARD_XRAY
})
export const fetchUnsavedCardXray = createThunkAction(FETCH_UNSAVED_CARD_XRAY, (questionUrlHash) =>
    (dispatch) => {
        let datasetQuery = null
        try {
            datasetQuery = Question.deserializeUrlHash(questionUrlHash).dataset_query
        } catch(e) {
            dispatch(setXrayError({ message: "Question hash is invalid" }))
            return
        }
        dispatch(unsavedCardXrayRequest.trigger(datasetQuery))
    }
)

export const FETCH_SHARED_TYPE_COMPARISON_XRAY = 'metabase/xray/FETCH_SHARED_TYPE_COMPARISON_XRAY';
const sharedTypeComparisonXrayRequest = new BackgroundJobRequest({
    creationEndpoint: XRayApi.compare_shared_type,
    resultPropName: 'comparison',
    actionPrefix: FETCH_SHARED_TYPE_COMPARISON_XRAY
})
export const fetchSharedTypeComparisonXray = createThunkAction(FETCH_SHARED_TYPE_COMPARISON_XRAY, (modelTypePlural, modelId1, modelId2, cost) =>
    (dispatch) =>
        dispatch(sharedTypeComparisonXrayRequest.trigger({ modelTypePlural, modelId1, modelId2, ...COSTS[cost].method }))
)

export const FETCH_TWO_TYPES_COMPARISON_XRAY = 'metabase/xray/FETCH_TWO_TYPES_COMPARISON_XRAY';
const twoTypesComparisonXrayRequest = new BackgroundJobRequest({
    creationEndpoint: XRayApi.compare_two_types,
    resultPropName: 'comparison',
    actionPrefix: FETCH_TWO_TYPES_COMPARISON_XRAY
})
export const fetchTwoTypesComparisonXray = createThunkAction(FETCH_TWO_TYPES_COMPARISON_XRAY, (modelType1, modelId1, modelType2, modelId2, cost) =>
    (dispatch) =>
        dispatch(twoTypesComparisonXrayRequest.trigger({ modelType1, modelId1, modelType2, modelId2, ...COSTS[cost].method }))
)

export default handleActions({
    ...fieldXrayRequest.getReducers(),
    ...tableXrayRequest.getReducers(),
    ...segmentXrayRequest.getReducers(),
    ...cardXrayRequest.getReducers(),
    ...unsavedCardXrayRequest.getReducers(),
    ...sharedTypeComparisonXrayRequest.getReducers(),
    ...twoTypesComparisonXrayRequest.getReducers(),
    [INITIALIZE]: () => tableXrayRequest.getDefaultState(),
    [SET_XRAY_ERROR]: (state, { payload: error }) => ({ ...state, error })
}, tableXrayRequest.getDefaultState())
