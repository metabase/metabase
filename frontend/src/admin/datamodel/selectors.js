
import { createSelector } from 'reselect';

const segmentsSelector         = state => state.datamodel.segments;
const metricsSelector          = state => state.datamodel.metrics;

const tableMetadataSelector    = state => state.datamodel.tableMetadata;
const previewSummarySelector   = state => state.datamodel.previewSummary;
const revisionObjectSelector   = state => state.datamodel.revisionObject;

const idSelector               = state => state.router.params.id == null ? null : parseInt(state.router.params.id);
const tableIdSelector          = state => state.router.location.query.table == null ? null : parseInt(state.router.location.query.table);

const userSelector             = state => state.user;

export const segmentEditSelectors = createSelector(
    segmentsSelector,
    idSelector,
    tableIdSelector,
    tableMetadataSelector,
    (segments, id, tableId, tableMetadata) => ({
        segment: id == null ?
            { id: null, table_id: tableId, definition: { filter: [] } } :
            segments[id],
        tableMetadata
    })
);

export const segmentFormSelectors = createSelector(
    segmentEditSelectors,
    previewSummarySelector,
    ({ segment, tableMetadata }, previewSummary) => ({
        initialValues: segment,
        tableMetadata,
        previewSummary
    })
);

export const metricEditSelectors = createSelector(
    metricsSelector,
    idSelector,
    tableIdSelector,
    tableMetadataSelector,
    (metrics, id, tableId, tableMetadata) => ({
        metric: id == null ?
            { id: null, table_id: tableId, definition: { aggregation: [null], filter: [] } } :
            metrics[id],
        tableMetadata
    })
);

export const metricFormSelectors = createSelector(
    metricEditSelectors,
    previewSummarySelector,
    ({ metric, tableMetadata }, previewSummary) => ({
        initialValues: metric,
        tableMetadata,
        previewSummary
    })
);

export const revisionHistorySelectors = createSelector(
    revisionObjectSelector,
    tableMetadataSelector,
    userSelector,
    (revisionObject, tableMetadata, user) => ({
        ...revisionObject,
        tableMetadata,
        user
    })
);
