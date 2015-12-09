
import { createAction } from "redux-actions";
import { AngularResourceProxy } from "metabase/lib/redux";

import { loadTable } from "metabase/lib/table";

const Segment = new AngularResourceProxy("Segment", ["get", "create", "update", "delete"]);
const Metabase = new AngularResourceProxy("Metabase", ["dataset"]);

export const NEW_SEGMENT = "NEW_SEGMENT";
export const GET_SEGMENT = "GET_SEGMENT";
export const CREATE_SEGMENT = "CREATE_SEGMENT";
export const UPDATE_SEGMENT = "UPDATE_SEGMENT";
export const DELETE_SEGMENT = "DELETE_SEGMENT";

export const SET_CURRENT_SEGMENT_ID = "SET_CURRENT_SEGMENT_ID";

export const LOAD_TABLE_METADATA = "LOAD_TABLE_METADATA";
export const UPDATE_RESULT_COUNT = "UPDATE_RESULT_COUNT";

export const newSegment    = createAction(NEW_SEGMENT);
export const getSegment    = createAction(GET_SEGMENT, Segment.get);
export const createSegment = createAction(CREATE_SEGMENT, Segment.create);
export const updateSegment = createAction(UPDATE_SEGMENT, Segment.update);
export const deleteSegment = createAction(DELETE_SEGMENT, Segment.delete);

export const setCurrentSegmentId = createAction(SET_CURRENT_SEGMENT_ID);

export const loadTableMetadata = createAction(LOAD_TABLE_METADATA, loadTable);

export const updateResultCount = createAction(UPDATE_RESULT_COUNT, async (query) => {
    let result = await Metabase.dataset({
        ...query,
        query: {
            ...query.query,
            aggregation: ["count"]
        }
    });
    return result.data.rows[0][0];
});
