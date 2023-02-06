import { t } from "ttag";
import { createAction } from "redux-actions";
import { updateIn } from "icepick";
import { createEntity } from "metabase/lib/entities";

import type {
  ActionFormSettings,
  ImplicitQueryAction,
  WritebackActionBase,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { ActionsApi } from "metabase/services";

import {
  removeOrphanSettings,
  addMissingSettings,
  setParameterTypesFromFieldSettings,
  setTemplateTagTypesFromFieldSettings,
} from "metabase/entities/actions/utils";
import type Question from "metabase-lib/Question";

export type ActionParams = {
  id?: WritebackAction["id"];
  name: WritebackAction["name"];
  type?: WritebackAction["type"];
  kind?: ImplicitQueryAction["kind"];
  description?: WritebackAction["description"];
  model_id: WritebackAction["model_id"];
  question?: Question;
  formSettings?: ActionFormSettings;
};

interface BaseCreateActionParams {
  model_id: WritebackActionBase["model_id"];
  name: WritebackActionBase["name"];
  description: WritebackActionBase["description"];
  parameters?: WritebackActionBase["parameters"];
}

interface UpdateActionParams {
  id: WritebackActionBase["id"];
}

export interface CreateQueryActionOptions extends BaseCreateActionParams {
  question: Question;
  formSettings: ActionFormSettings;
}

export type UpdateQueryActionOptions = CreateQueryActionOptions &
  UpdateActionParams;

export interface CreateImplicitActionOptions extends BaseCreateActionParams {
  kind: ImplicitQueryAction["kind"];
}

export type UpdateImplicitActionOptions = CreateImplicitActionOptions &
  UpdateActionParams;

function cleanUpQueryAction(
  question: Question,
  formSettings: ActionFormSettings,
) {
  question = setTemplateTagTypesFromFieldSettings(formSettings, question);

  const parameters = setParameterTypesFromFieldSettings(
    formSettings,
    question.parameters(),
  );

  const visualization_settings = removeOrphanSettings(
    addMissingSettings(formSettings, parameters),
    parameters,
  );

  return {
    dataset_query: question.datasetQuery(),
    parameters,
    visualization_settings,
  };
}

function createQueryAction({
  question,
  formSettings,
  ...action
}: CreateQueryActionOptions) {
  const { dataset_query, parameters, visualization_settings } =
    cleanUpQueryAction(question, formSettings);

  return ActionsApi.create({
    ...action,
    type: "query",
    dataset_query,
    database_id: dataset_query.database,
    parameters,
    visualization_settings,
  });
}

function updateQueryAction({
  question,
  formSettings,
  ...action
}: UpdateQueryActionOptions) {
  const { dataset_query, parameters, visualization_settings } =
    cleanUpQueryAction(question, formSettings);

  return ActionsApi.update({
    ...action,
    dataset_query,
    parameters,
    visualization_settings,
  });
}

function createImplicitAction(action: CreateImplicitActionOptions) {
  return Actions.actions.create({
    ...action,
    type: "implicit",
  });
}

function updateImplicitAction(action: UpdateImplicitActionOptions) {
  return Actions.actions.update({
    ...action,
    type: "implicit",
  });
}

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
    create: (
      params: CreateQueryActionOptions | CreateImplicitActionOptions,
    ) => {
      if ("question" in params) {
        return createQueryAction(params);
      }
      return createImplicitAction(params);
    },
    update: (
      params: UpdateQueryActionOptions | UpdateImplicitActionOptions,
    ) => {
      if ("question" in params) {
        return updateQueryAction(params);
      }
      return updateImplicitAction(params);
    },
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
