import { updateIn } from "icepick";
import { t } from "ttag";

import {
  actionApi,
  useGetActionQuery,
  useListActionsQuery,
} from "metabase/api";
import {
  createEntity,
  entityCompatibleQuery,
  undo,
} from "metabase/lib/entities";
import { createThunkAction } from "metabase/lib/redux";
import { ActionSchema } from "metabase/schema";
import type {
  CreateActionRequest,
  GetActionRequest,
  ListActionsRequest,
  UpdateActionRequest,
  WritebackAction,
  WritebackActionId,
  WritebackImplicitQueryAction,
  WritebackQueryAction,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

type BaseCreateActionParams = Pick<
  WritebackAction,
  "name" | "description" | "model_id" | "parameters" | "visualization_settings"
>;

type BaseUpdateActionParams = {
  id: WritebackAction["id"];
};

export type CreateQueryActionParams = BaseCreateActionParams &
  Pick<WritebackQueryAction, "type" | "dataset_query">;

export type UpdateQueryActionParams = Partial<CreateQueryActionParams> &
  BaseUpdateActionParams;

export type CreateImplicitActionParams = BaseCreateActionParams &
  Pick<WritebackImplicitQueryAction, "type" | "kind">;

export type UpdateImplicitActionParams = Omit<
  Partial<CreateImplicitActionParams>,
  "type"
> &
  BaseUpdateActionParams;

export type CreateActionParams =
  | CreateQueryActionParams
  | CreateImplicitActionParams;

export type UpdateActionParams =
  | UpdateQueryActionParams
  | UpdateImplicitActionParams;

const defaultImplicitActionCreateOptions = {
  insert: true,
  update: true,
  delete: true,
};

const enableImplicitActionsForModel =
  (modelId: number, options = defaultImplicitActionCreateOptions) =>
  async (dispatch: Dispatch) => {
    // We're ordering actions that's most recently created first.
    // So if we want to show Create, Update, Delete, then we need
    // to create them in the reverse order.
    if (options.delete) {
      await Actions.api.create(
        {
          name: t`Delete`,
          type: "implicit",
          kind: "row/delete",
          model_id: modelId,
        },
        dispatch,
      );
    }

    if (options.update) {
      await Actions.api.create(
        {
          name: t`Update`,
          type: "implicit",
          kind: "row/update",
          model_id: modelId,
        },
        dispatch,
      );
    }

    if (options.insert) {
      await Actions.api.create(
        {
          name: t`Create`,
          type: "implicit",
          kind: "row/create",
          model_id: modelId,
        },
        dispatch,
      );
    }

    dispatch(Actions.actions.invalidateLists());
  };

const CREATE_PUBLIC_LINK = "metabase/entities/actions/CREATE_PUBLIC_LINK";
const DELETE_PUBLIC_LINK = "metabase/entities/actions/DELETE_PUBLIC_LINK";

/**
 * @deprecated use "metabase/api" instead
 */
export const Actions = createEntity({
  name: "actions",
  nameOne: "action",
  schema: ActionSchema,
  path: "/api/action",
  rtk: {
    getUseGetQuery: () => ({
      useGetQuery: useGetActionQuery,
    }),
    useListQuery: useListActionsQuery,
  },
  api: {
    list: (entityQuery: ListActionsRequest, dispatch: Dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        actionApi.endpoints.listActions,
      ),
    get: (
      entityQuery: GetActionRequest,
      _options: unknown,
      dispatch: Dispatch,
    ) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        actionApi.endpoints.getAction,
      ),
    create: (entityQuery: CreateActionRequest, dispatch: Dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        actionApi.endpoints.createAction,
      ),
    update: (entityQuery: UpdateActionRequest, dispatch: Dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        actionApi.endpoints.updateAction,
      ),
    delete: (id: WritebackActionId, dispatch: Dispatch) =>
      entityCompatibleQuery(id, dispatch, actionApi.endpoints.deleteAction),
  },
  actions: {
    enableImplicitActionsForModel,
  },
  writableProperties: [
    "name",
    "description",
    "type",
    "model_id",
    "database_id",
    "dataset_query",
    "parameters",
    "public_uuid",
    "visualization_settings",
    "archived",
  ],
  objectActions: {
    createPublicLink: createThunkAction(
      CREATE_PUBLIC_LINK,
      ({ id }: { id: WritebackActionId }) =>
        async (dispatch: Dispatch) => {
          const data = await entityCompatibleQuery(
            { id },
            dispatch,
            actionApi.endpoints.createActionPublicLink,
          );

          return { id, uuid: data.uuid };
        },
    ),
    deletePublicLink: createThunkAction(
      DELETE_PUBLIC_LINK,
      ({ id }: { id: WritebackActionId }) =>
        async (dispatch: Dispatch) => {
          await entityCompatibleQuery(
            { id },
            dispatch,
            actionApi.endpoints.deleteActionPublicLink,
          );

          return { id };
        },
    ),
    setArchived: ({ id }: WritebackAction, archived: boolean) =>
      Actions.actions.update(
        { id },
        { archived },
        undo({}, t`action`, archived ? t`archived` : t`unarchived`),
      ),
  },
  reducer: (state = {}, { type, payload }: { type: string; payload: any }) => {
    switch (type) {
      case CREATE_PUBLIC_LINK: {
        const { id, uuid } = payload;
        return updateIn(state, [id], (action) => {
          return { ...action, public_uuid: uuid };
        });
      }
      case DELETE_PUBLIC_LINK: {
        const { id } = payload;
        return updateIn(state, [id], (action) => {
          return { ...action, public_uuid: null };
        });
      }
      default: {
        return state;
      }
    }
  },
});
