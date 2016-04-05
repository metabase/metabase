
import { createAction } from "redux-actions";
import { AngularResourceProxy, createThunkAction } from "metabase/lib/redux";

import { loadTable } from "metabase/lib/table";

const Segment = new AngularResourceProxy("Segment", ["get", "create", "update", "delete"]);
const Metric = new AngularResourceProxy("Metric", ["get", "create", "update", "delete"]);
const Metabase = new AngularResourceProxy("Metabase", ["dataset"]);
const Revisions = new AngularResourceProxy("Revisions", ["get"]);

// SEGMENTS

export const GET_SEGMENT = "GET_SEGMENT";
export const CREATE_SEGMENT = "CREATE_SEGMENT";
export const UPDATE_SEGMENT = "UPDATE_SEGMENT";
export const DELETE_SEGMENT = "DELETE_SEGMENT";

export const getSegment    = createAction(GET_SEGMENT, Segment.get);
export const createSegment = createAction(CREATE_SEGMENT, Segment.create);
export const updateSegment = createAction(UPDATE_SEGMENT, Segment.update);
export const deleteSegment = createAction(DELETE_SEGMENT, Segment.delete);

// METRICS

export const GET_METRIC = "GET_METRIC";
export const CREATE_METRIC = "CREATE_METRIC";
export const UPDATE_METRIC = "UPDATE_METRIC";
export const DELETE_METRIC = "DELETE_METRIC";

export const getMetric    = createAction(GET_METRIC, Metric.get);
export const createMetric = createAction(CREATE_METRIC, Metric.create);
export const updateMetric = createAction(UPDATE_METRIC, Metric.update);
export const deleteMetric = createAction(DELETE_METRIC, Metric.delete);

// SEGMENT DETAIL

export const LOAD_TABLE_METADATA = "LOAD_TABLE_METADATA";
export const UPDATE_PREVIEW_SUMMARY = "UPDATE_PREVIEW_SUMMARY";

export const loadTableMetadata = createAction(LOAD_TABLE_METADATA, loadTable);
export const updatePreviewSummary = createAction(UPDATE_PREVIEW_SUMMARY, async (query) => {
    let result = await Metabase.dataset(query);
    return result.data.rows[0][0];
});

// REVISION HISTORY

export const FETCH_REVISIONS = "FETCH_REVISIONS";

export const fetchRevisions = createThunkAction(FETCH_REVISIONS, ({ entity, id }) =>
    async (dispatch, getState) => {
        let action;
        switch (entity) {
            case "segment": action = getSegment({ segmentId: id }); break;
            case "metric": action = getMetric({ metricId: id }); break;
        }
        let [object, revisions] = await Promise.all([
            dispatch(action),
            Revisions.get({ entity, id })
        ]);
        await dispatch(loadTableMetadata(object.payload.definition.source_table));
        return { object: object.payload, revisions };
    }
);
