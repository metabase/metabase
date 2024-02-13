import { assocIn, dissocIn, updateIn } from "icepick";
import { t } from "ttag";

import { CardApi, MetabaseApi } from "metabase/services";
import { runQuestionQuery } from "metabase/query_builder/actions";
import Collections from "metabase/entities/collections";

import type { Dispatch, State } from "metabase-types/store";
import type { CollectionId, TableId } from "metabase-types/api";
import type { FileUploadState } from "metabase-types/store/upload";

import {
  createAction,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";

export const UPLOAD_FILE_TO_COLLECTION = "metabase/collection/UPLOAD_FILE";
export const UPLOAD_FILE_START = "metabase/collection/UPLOAD_FILE_START";
export const UPLOAD_FILE_END = "metabase/collection/UPLOAD_FILE_END";
export const UPLOAD_FILE_ERROR = "metabase/collection/UPLOAD_FILE_ERROR";
export const UPLOAD_FILE_CLEAR = "metabase/collection/UPLOAD_FILE_CLEAR";
export const UPLOAD_FILE_CLEAR_ALL =
  "metabase/collection/UPLOAD_FILE_CLEAR_ALL";

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
export const MAX_UPLOAD_STRING = "50";

const CLEAR_AFTER_MS = 8000;

const uploadStart = createAction(UPLOAD_FILE_START);
const uploadEnd = createAction(UPLOAD_FILE_END);
const uploadError = createAction(UPLOAD_FILE_ERROR);
const clearUpload = createAction(UPLOAD_FILE_CLEAR);
export const clearAllUploads = createAction(UPLOAD_FILE_CLEAR_ALL);

export const getAllUploads = (state: State) => Object.values(state.upload);

export const hasActiveUploads = (state: State) =>
  getAllUploads(state).some(upload => upload.status === "in-progress");

export const uploadFile = createThunkAction(
  UPLOAD_FILE_TO_COLLECTION,
  ({
      file,
      collectionId,
      tableId,
    }: {
      file: File;
      collectionId?: CollectionId;
      tableId?: TableId;
    }) =>
    async (dispatch: Dispatch) => {
      const id = Date.now();

      const clear = () =>
        setTimeout(() => {
          dispatch(clearUpload({ id }));
        }, CLEAR_AFTER_MS);

      dispatch(
        uploadStart({
          id,
          name: file.name,
          collectionId,
          tableId,
        }),
      );

      if (file.size > MAX_UPLOAD_SIZE) {
        dispatch(
          uploadError({
            id,
            message: t`You cannot upload files larger than ${MAX_UPLOAD_STRING} MB`,
          }),
        );
        clear();
        return;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("collection_id", String(collectionId));

        const response = await (tableId
          ? MetabaseApi.tableAppendCSV({ tableId, formData })
          : CardApi.uploadCSV({ formData }));

        dispatch(
          uploadEnd({
            id,
            modelId: response,
          }),
        );

        if (tableId) {
          dispatch(runQuestionQuery());
        } else if (collectionId) {
          dispatch(Collections.actions.invalidateLists());
        }

        clear();
      } catch (err: any) {
        dispatch(
          uploadError({
            id,
            message: t`There was an error uploading the file`,
            error: err?.data?.message ?? err?.data,
          }),
        );
      }
    },
);

interface UploadStartPayload {
  id: number;
  name: string;
  collectionId?: CollectionId;
  tableId?: TableId;
}

interface UploadEndPayload {
  id: number;
}

const upload = handleActions<
  FileUploadState,
  UploadStartPayload | UploadEndPayload
>(
  {
    [UPLOAD_FILE_START]: {
      next: (state, { payload }) =>
        assocIn(state, [payload.id], {
          ...payload,
          status: "in-progress",
        }),
    },
    [UPLOAD_FILE_END]: {
      next: (state, { payload }) =>
        updateIn(state, [payload.id], val => ({
          ...val,
          ...payload,
          status: "complete",
        })),
    },
    [UPLOAD_FILE_ERROR]: {
      next: (state, { payload }) =>
        updateIn(state, [payload.id], val => ({
          ...val,
          ...payload,
          status: "error",
        })),
    },
    [UPLOAD_FILE_CLEAR]: {
      next: (state, { payload: { id } }) => dissocIn(state, [id]),
    },
    [UPLOAD_FILE_CLEAR_ALL]: {
      next: () => ({}),
    },
  },
  {},
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default upload;
