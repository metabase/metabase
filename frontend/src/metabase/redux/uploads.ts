import { assocIn, updateIn } from "icepick";
import { Dispatch, GetState, State } from "metabase-types/store";

import {
  combineReducers,
  createAction,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";

export const UPLOAD_CSV_TO_COLLECTION = "metabase/collection/UPLOAD_CSV";

export const UPLOAD_CSV_TO_COLLECTION_START =
  "metabase/collection/UPLOAD_CSV_START";

export const UPLOAD_CSV_TO_COLLECTION_END =
  "metabase/collection/UPLOAD_CSV_END";

const uploadStart = createAction(UPLOAD_CSV_TO_COLLECTION_START);
const uploadEnd = createAction(UPLOAD_CSV_TO_COLLECTION_END);

export const getAllUploads = (state: State) =>
  Object.keys(state.upload.upload).map(key => state.upload.upload[key]);

export const uploadCSV = createThunkAction(
  UPLOAD_CSV_TO_COLLECTION,
  (file: File, collectionId: string) =>
    async (dispatch: Dispatch, getState: GetState) => {
      // console.log(file, collectionId, getState());

      const uploads = getAllUploads(getState());
      const id = uploads.length;

      dispatch(
        uploadStart({
          id,
          name: file.name,
          collectionId,
        }),
      );

      await setTimeout(() => {
        dispatch(uploadEnd({ id }));
      }, 6000);
    },
);

const upload = handleActions(
  {
    [UPLOAD_CSV_TO_COLLECTION_START]: {
      next: (state, { payload }) =>
        assocIn(state, [payload.id], {
          ...payload,
          status: "in-progress",
        }),
    },
    [UPLOAD_CSV_TO_COLLECTION_END]: {
      next: (state, { payload }) =>
        assocIn(state, [payload.id, "status"], "complete"),
    },
  },
  {},
);

export default combineReducers({
  upload,
});
