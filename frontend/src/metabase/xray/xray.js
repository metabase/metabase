import { assoc } from 'icepick'

import {
    createThunkAction,
    handleActions
} from 'metabase/lib/redux'

import { XRayApi } from 'metabase/services'

const FETCH_FIELD_XRAY = 'metabase/xray/FETCH_FIELD_XRAY'
export const fetchFieldXray = createThunkAction(FETCH_FIELD_XRAY, (fieldId, cost) =>
    async () => {
        try {
            const xray = await XRayApi.field_xray({ fieldId, ...cost.method })
            return xray
        } catch (error) {
            console.error(error)
        }
    }
)

const FETCH_TABLE_XRAY = 'metabase/xray/FETCH_TABLE_XRAY'
export const fetchTableXray = createThunkAction(FETCH_TABLE_XRAY, (tableId, cost) =>
    async () => {
        try {
            const xray = await XRayApi.table_xray({ tableId, ...cost.method })
            return xray
        } catch (error) {
            console.error(error)
        }
    }
)


const FETCH_SEGMENT_XRAY = 'metabase/xray/FETCH_SEGMENT_XRAY'
export const fetchSegmentXray = createThunkAction(FETCH_SEGMENT_XRAY, (segmentId, cost) =>
    async () => {
        try {
            const xray = await XRayApi.segment_xray({ segmentId, ...cost.method })
            return xray
        } catch (error) {
            console.error(error)
        }
    }
)

const FETCH_CARD_XRAY = 'metabase/xray/FETCH_CARD_XRAY';
export const fetchCardXray = createThunkAction(FETCH_CARD_XRAY, (cardId) =>
    async () => {
        try {
            const xray = await XRayApi.card_xray({ cardId });
            return xray;
        } catch (error) {
            console.error(error);
        }
    }
)

const FETCH_FIELD_COMPARISON = 'metabase/xray/FETCH_FIELD_COMPARISON';
export const fetchFieldComparison = createThunkAction(FETCH_FIELD_COMPARISON, function(fieldId1, fieldId2) {
    async () => {
        try {
            const comparison = await XRayApi.field_compare({ fieldId1, fieldId2 })
            return comparison
        } catch (error) {
            console.error(error)
        }
    }
})
const FETCH_TABLE_COMPARISON = 'metabase/xray/FETCH_TABLE_COMPARISON';
export const fetchTableComparison = createThunkAction(FETCH_TABLE_COMPARISON, function(tableId1, tableId2) {
    async () => {
        try {
            const comparison = await XRayApi.table_compare({ tableId1, tableId2 })
            return comparison
        } catch (error) {
            console.error(error)
        }
    }
})

const FETCH_SEGMENT_COMPARISON = 'metabase/xray/FETCH_SEGMENT_COMPARISON';
export const fetchSegmentComparison = createThunkAction(FETCH_SEGMENT_COMPARISON, function(segmentId1, segmentId2) {
    async () => {
        try {
            const comparison = await XRayApi.segment_compare({ segmentId1, segmentId2 })
            return comparison
        } catch (error) {
            console.error(error)
        }
    }
})

const FETCH_METRIC_COMPARISON = 'metabase/xray/FETCH_METRIC_COMPARISON';
export const fetchMetricComparison = createThunkAction(FETCH_METRIC_COMPARISON, function(metricId1, metricId2) {
    async () => {
        try {
            const comparison = await XRayApi.metric_compare({ metricId1, metricId2 })
            return comparison
        } catch (error) {
            console.error(error)
        }
    }
})

const FETCH_CARD_COMPARISON = 'metabase/xray/FETCH_CARD_COMPARISON';
export const fetchCardComparison = createThunkAction(FETCH_CARD_COMPARISON, (cardId1, cardId2) =>
    async () => {
        try {
            const comparison = await XRayApi.card_compare({ cardId1, cardId2 })
            return comparison
        } catch (error) {
            console.error(error)
        }
    }
)

export default handleActions({
    [FETCH_FIELD_XRAY]: {
        next: (state, { payload }) => assoc(state, 'fieldXray', payload)
    },
    [FETCH_TABLE_XRAY]: {
        next: (state, { payload }) => assoc(state, 'tableXray', payload)
    },
    [FETCH_SEGMENT_XRAY]: {
        next: (state, { payload }) => assoc(state, 'segmentXray', payload)
    },
    [FETCH_FIELD_COMPARISON]: {
        next: (state, { payload }) => assoc(state, 'fieldComparison', payload)
    }
}, {})
