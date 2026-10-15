import { databaseApi, fieldApi, segmentApi, tableApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import {
  databaseFetched,
  fieldFetched,
  tableFetched,
} from "metabase/metadata-store";
import type { Dispatch } from "metabase/redux/store";
import type {
  Database,
  Field,
  Table,
  UpdateDatabaseRequest,
  UpdateFieldRequest,
  UpdateSegmentRequest,
  UpdateTableRequest,
} from "metabase-types/api";

export const updateDatabase =
  (request: UpdateDatabaseRequest) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const updated: Database = await runRtkEndpoint(
      request,
      dispatch,
      databaseApi.endpoints.updateDatabase,
    );
    dispatch(databaseFetched(updated));
    return updated;
  };

export const updateTable =
  (request: UpdateTableRequest) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const updated: Table = await runRtkEndpoint(
      request,
      dispatch,
      tableApi.endpoints.updateTable,
    );
    dispatch(tableFetched(updated));
    return updated;
  };

export const updateField =
  (request: UpdateFieldRequest) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const updated: Field = await runRtkEndpoint(
      request,
      dispatch,
      fieldApi.endpoints.updateField,
    );
    dispatch(fieldFetched(updated));
    return updated;
  };

export const updateSegment =
  (request: UpdateSegmentRequest) =>
  (dispatch: Dispatch): Promise<unknown> =>
    runRtkEndpoint(request, dispatch, segmentApi.endpoints.updateSegment);
