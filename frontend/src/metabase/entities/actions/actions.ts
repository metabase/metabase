import { t } from "ttag";
import { updateIn } from "icepick";
import { createAction } from "redux-actions";

import { createEntity } from "metabase/lib/entities";
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

const defaultImplicitActionCreateOptions = {
  insert: true,
  update: true,
  delete: true,
};

const enableImplicitActionsForModel =
  async (modelId: number, options = defaultImplicitActionCreateOptions) =>
  async (dispatch: Dispatch) => {
    const requests = [];

    if (options.insert) {
      requests.push(
        ActionsApi.create({
          name: t`Create`,
          type: "implicit",
          kind: "row/create",
          model_id: modelId,
        }),
      );
    }

    if (options.update) {
      requests.push(
        ActionsApi.create({
          name: t`Update`,
          type: "implicit",
          kind: "row/update",
          model_id: modelId,
        }),
      );
    }

    if (options.delete) {
      requests.push(
        ActionsApi.create({
          name: t`Delete`,
          type: "implicit",
          kind: "row/delete",
          model_id: modelId,
        }),
      );
    }

    await Promise.all(requests);

    dispatch(Actions.actions.invalidateLists());
  };

const CREATE_PUBLIC_LINK = "metabase/entities/actions/CREATE_PUBLIC_LINK";
const DELETE_PUBLIC_LINK = "metabase/entities/actions/DELETE_PUBLIC_LINK";

const Actions = createEntity({
  name: "actions",
  nameOne: "action",
  path: "/api/action",
  api: {
    create: (params: CreateQueryActionParams | CreateImplicitActionParams) =>
      ActionsApi.create(params),
    update: (params: UpdateQueryActionParams | UpdateImplicitActionParams) =>
      ActionsApi.update(params),
  },
  actions: {
    enableImplicitActionsForModel,
  },
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
});

export default Actions;
