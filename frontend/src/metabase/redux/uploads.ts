import { assocIn } from "icepick";
//import { uploadCSV } from "metabase/collections/upload";
import { Dispatch, GetState, State } from "metabase-types/store";
import { CollectionId } from "metabase-types/api";
import { FileUploadState } from "metabase-types/store/upload";
import {
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
  Object.keys(state.upload).map(key => state.upload[key]);

export const uploadCSV = createThunkAction(
  UPLOAD_CSV_TO_COLLECTION,
  (file: File, collectionId: CollectionId) =>
    async (dispatch: Dispatch, getState: GetState) => {
      const uploads = getAllUploads(getState());
      const id = uploads.length;

      dispatch(
        uploadStart({
          id,
          name: file.name,
          collectionId,
        }),
      );

      // Do API Request here
      // await uploadCSV({
      //   file,
      //   collectionId,
      // });

      await setTimeout(() => {
        dispatch(uploadEnd({ id }));
      }, 6000);
    },
);

interface UploadStartPayload {
  id: number;
  name: string;
  collectionId: string;
}

interface UploadEndPayload {
  id: number;
}

const upload = handleActions<
  FileUploadState,
  UploadStartPayload | UploadEndPayload
>(
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

export default upload;
