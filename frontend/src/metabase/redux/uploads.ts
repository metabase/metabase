import { assocIn, updateIn } from "icepick";
import { CardApi } from "metabase/services";
import { Dispatch, GetState, State } from "metabase-types/store";
import { CollectionId } from "metabase-types/api";
import { FileUploadState } from "metabase-types/store/upload";
import {
  createAction,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";

export const UPLOAD_FILE_TO_COLLECTION = "metabase/collection/UPLOAD_FILE";

const UPLOAD_FILE_TO_COLLECTION_START = "metabase/collection/UPLOAD_FILE_START";

const UPLOAD_FILE_TO_COLLECTION_END = "metabase/collection/UPLOAD_FILE_END";

const UPLOAD_FILE_TO_COLLECTION_ERROR = "metabase/collection/UPLOAD_FILE_ERROR";

const uploadStart = createAction(UPLOAD_FILE_TO_COLLECTION_START);
const uploadEnd = createAction(UPLOAD_FILE_TO_COLLECTION_END);
const uploadError = createAction(UPLOAD_FILE_TO_COLLECTION_ERROR);

export const getAllUploads = (state: State) =>
  Object.keys(state.upload).map(key => state.upload[key]);

export const uploadFile = createThunkAction(
  UPLOAD_FILE_TO_COLLECTION,
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

      const { modelId } = await CardApi.uploadCSV({
        file,
        collectionId,
      }).catch(({ data: { message }, status }) => {
        console.log(status);
        dispatch(
          uploadError({
            id,
            message,
          }),
        );
      });

      dispatch(
        uploadEnd({
          id,
          modelId,
        }),
      );
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
    [UPLOAD_FILE_TO_COLLECTION_START]: {
      next: (state, { payload }) =>
        assocIn(state, [payload.id], {
          ...payload,
          status: "in-progress",
        }),
    },
    [UPLOAD_FILE_TO_COLLECTION_END]: {
      next: (state, { payload }) =>
        updateIn(state, [payload.id], val => ({
          ...val,
          ...payload,
          status: "complete",
        })),
    },
    [UPLOAD_FILE_TO_COLLECTION_ERROR]: {
      next: (state, { payload }) =>
        updateIn(state, [payload.id], val => ({
          ...val,
          ...payload,
          status: "error",
        })),
    },
  },
  {},
);

export default upload;
