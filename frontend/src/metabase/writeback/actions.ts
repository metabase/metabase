import { t } from "ttag";
import { push } from "react-router-redux";

import Actions from "metabase/entities/actions";
import { ActionsApi } from "metabase/services";
import { addUndo } from "metabase/redux/undo";

import Table from "metabase-lib/lib/metadata/Table";

import {
  Parameter,
  ParameterId,
  ParameterTarget,
} from "metabase-types/types/Parameter";
import { Dispatch, GetState } from "metabase-types/store";

import {
  HttpActionErrorHandle,
  HttpActionResponseHandle,
  HttpActionTemplate,
} from "./types";

export type InsertRowPayload = {
  table: Table;
  values: Record<string, unknown>;
};

export const createRow = (payload: InsertRowPayload) => {
  const { table, values } = payload;
  return ActionsApi.create({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
    },
    create_row: values,
  });
};

export type UpdateRowPayload = {
  table: Table;
  id: number | string;
  values: Record<string, unknown>;
};

export const updateRow = (payload: UpdateRowPayload) => {
  const { table, id, values } = payload;
  const field = table.fields.find(field => field.isPK());
  if (!field) {
    throw new Error("Cannot update row from table without a primary key");
  }

  const pk = field.isNumeric() && typeof id === "string" ? parseInt(id) : id;
  return ActionsApi.update({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: ["=", field.reference(), pk],
    },
    update_row: values,
  });
};

export type BulkUpdatePayload = {
  table: Table;
  records: Record<string, unknown>[];
};

export const updateManyRows = (payload: BulkUpdatePayload) => {
  const { table, records } = payload;
  return ActionsApi.bulkUpdate(
    {
      tableId: table.id,
      body: records,
    },
    { bodyParamName: "body" },
  );
};

export type DeleteRowPayload = {
  table: Table;
  id: number | string;
};

export const deleteRow = (payload: DeleteRowPayload) => {
  const { table, id } = payload;
  const field = table.fields.find(field => field.isPK());
  if (!field) {
    throw new Error("Cannot delete row from table without a primary key");
  }

  const pk = field.isNumeric() && typeof id === "string" ? parseInt(id) : id;
  return ActionsApi.delete({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: ["=", field.reference(), pk],
    },
  });
};

export type BulkDeletePayload = {
  table: Table;
  ids: Record<string, number | string>[];
};

export const deleteManyRows = (payload: BulkDeletePayload) => {
  const { table, ids } = payload;
  return ActionsApi.bulkDelete(
    {
      tableId: table.id,
      body: ids,
    },
    { bodyParamName: "body" },
  );
};

export type CreateHttpActionPayload = {
  name: string;
  description: string;
  template: HttpActionTemplate;
  response_handle: HttpActionResponseHandle;
  error_handle: HttpActionErrorHandle;
  parameters: Record<ParameterId, Parameter>;
  parameter_mappings: Record<ParameterId, ParameterTarget>;
};

export const createHttpAction =
  (payload: CreateHttpActionPayload) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const {
      name,
      description,
      template,
      error_handle = null,
      response_handle = null,
      parameters,
      parameter_mappings,
    } = payload;
    const data = {
      method: template.method || "GET",
      url: template.url,
      body: template.body || JSON.stringify({}),
      headers: JSON.stringify(template.headers || {}),
      parameters: template.parameters || {},
      parameter_mappings: template.parameter_mappings || {},
    };
    const newAction = {
      name,
      type: "http",
      description,
      template: data,
      error_handle,
      response_handle,
      parameters,
      parameter_mappings,
    };
    const response = await dispatch(Actions.actions.create(newAction));
    const action = Actions.HACK_getObjectFromAction(response);
    if (action.id) {
      dispatch(
        addUndo({
          message: t`Action saved!`,
        }),
      );
      dispatch(push(`/action/${action.id}`));
    } else {
      dispatch(
        addUndo({
          message: t`Could not save action`,
        }),
      );
    }
  };
