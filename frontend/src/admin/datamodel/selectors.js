
import { createSelector } from 'reselect';

const segmentsSelector         = state => state.segments;
const currentSegmentIdSelector = state => state.currentSegmentId;
const tableMetadataSelector    = state => state.tableMetadata;
const resultCountSelector      = state => state.resultCount;

// EDIT
export const segmentEditSelectors = createSelector(
    [segmentsSelector, currentSegmentIdSelector, tableMetadataSelector],
    (segments, currentSegmentId, tableMetadata) => ({
        segment: segments[currentSegmentId],
        tableMetadata
    })
);

export const segmentFormSelectors = createSelector(
    [segmentEditSelectors, tableMetadataSelector, resultCountSelector],
    ({ segment }, tableMetadata, resultCount) => ({ initialValues: segment, tableMetadata, resultCount })
);
