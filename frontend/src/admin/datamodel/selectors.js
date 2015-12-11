
import { createSelector } from 'reselect';

const segmentsSelector         = state => state.datamodel.segments;
const currentSegmentIdSelector = state => state.datamodel.currentSegmentId;
const tableMetadataSelector    = state => state.datamodel.tableMetadata;
const resultCountSelector      = state => state.datamodel.resultCount;
const revisionObjectSelector   = state => state.datamodel.revisionObject;

export const segmentEditSelectors = createSelector(
    segmentsSelector,
    currentSegmentIdSelector,
    tableMetadataSelector,
    (segments, currentSegmentId, tableMetadata) => ({
        segment: segments[currentSegmentId],
        tableMetadata
    })
);

export const segmentFormSelectors = createSelector(
    segmentEditSelectors,
    resultCountSelector,
    ({ segment, tableMetadata }, resultCount) => ({
        initialValues: segment,
        tableMetadata,
        resultCount
    })
);

export const revisionHistorySelectors = createSelector(
    revisionObjectSelector,
    (object) => ({
        name: object && object.name,
        revisions: object && object.revisions
    })
);
