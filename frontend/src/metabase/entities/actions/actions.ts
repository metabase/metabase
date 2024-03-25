import { updateIn } from "icepick";
import { createAction } from "redux-actions";
import { t } from "ttag";
import _ from "underscore";

import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { ActionSchema } from "metabase/schema";
import { ActionsApi } from "metabase/services";
import type {
  WritebackAction,
  WritebackActionId,
  WritebackQueryAction,
  WritebackImplicitQueryAction,
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
  async (modelId: number, options = defaultImplicitActionCreateOptions) =>
  async (dispatch: Dispatch) => {
    // We're ordering actions that's most recently created first.
    // So if we want to show Create, Update, Delete, then we need
    // to create them in the reverse order.
    if (options.delete) {
      await ActionsApi.create({
        name: t`Delete`,
        type: "implicit",
        kind: "row/delete",
        model_id: modelId,
      });
    }

    if (options.update) {
      await ActionsApi.create({
        name: t`Update`,
        type: "implicit",
        kind: "row/update",
        model_id: modelId,
      });
    }

    if (options.insert) {
      await ActionsApi.create({
        name: t`Create`,
        type: "implicit",
        kind: "row/create",
        model_id: modelId,
      });
    }

    dispatch(Actions.actions.invalidateLists());
  };

const CREATE_PUBLIC_LINK = "metabase/entities/actions/CREATE_PUBLIC_LINK";
const DELETE_PUBLIC_LINK = "metabase/entities/actions/DELETE_PUBLIC_LINK";

/**
 * @deprecated use "metabase/api" instead
 */
const Actions = createEntity({
  name: "actions",
  nameOne: "action",
  schema: ActionSchema,
  path: "/api/action",
  api: {
    create: (params: CreateActionParams) => ActionsApi.create(params),
    update: (params: UpdateActionParams) => {
      // Changing action type is not supported
      const cleanParams = _.omit(params, "type");
      return ActionsApi.update(cleanParams);
    },
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
    createPublicLink: createAction(
      CREATE_PUBLIC_LINK,
      ({ id }: { id: WritebackActionId }) => {
        return ActionsApi.createPublicLink({ id }).then(
          ({ uuid }: { uuid: string }) => {
            return {
              id,
              uuid,
            };
          },
        );
      },
    ),
    deletePublicLink: createAction(
      DELETE_PUBLIC_LINK,
      ({ id }: { id: WritebackActionId }) => {
        return ActionsApi.deletePublicLink({ id }).then(() => {
          return {
            id,
          };
        });
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
        return updateIn(state, [id], action => {
          return { ...action, public_uuid: uuid };
        });
      }
      case DELETE_PUBLIC_LINK: {
        const { id } = payload;
        return updateIn(state, [id], action => {
          return { ...action, public_uuid: null };
        });
      }
      default: {
        return state;
      }
    }
  },
  objectSelectors: {
    getUrl: (action: WritebackAction) =>
      Urls.action({ id: action.model_id }, action.id),
    getIcon: () => ({ name: "bolt" }),
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Actions;
