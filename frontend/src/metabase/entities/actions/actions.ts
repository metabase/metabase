import { createEntity } from "metabase/lib/entities";

import type { ActionFormSettings, WritebackAction } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { ActionsApi, CardApi, ModelActionsApi } from "metabase/services";

import {
  removeOrphanSettings,
  addMissingSettings,
  setParameterTypesFromFieldSettings,
  setTemplateTagTypesFromFieldSettings,
} from "metabase/entities/actions/utils";
import type Question from "metabase-lib/Question";
import { saveForm, updateForm } from "./forms";

type ActionParams = {
  name: string;
  description?: string;
  model_id?: number;
  collection_id?: number;
  question: Question;
  formSettings: ActionFormSettings;
};

const getAPIFn =
  (apifn: (args: any) => Promise<any>) =>
  ({
    name,
    description,
    question,
    collection_id,
    formSettings,
  }: ActionParams) => {
    question = setTemplateTagTypesFromFieldSettings(formSettings, question);

    const parameters = setParameterTypesFromFieldSettings(
      formSettings,
      question.parameters(),
    );
    const settings = removeOrphanSettings(
      addMissingSettings(formSettings, parameters),
      parameters,
    );

    return apifn({
      ...question.card(),
      name,
      description,
      parameters,
      is_write: true,
      display: "table",
      visualization_settings: settings,
      collection_id,
    });
  };

const createAction = getAPIFn(CardApi.create);
const updateAction = getAPIFn(CardApi.update);

const associateAction = ({
  model_id,
  action_id,
}: {
  model_id: number;
  action_id: number;
}) =>
  ModelActionsApi.connectActionToModel({
    card_id: model_id,
    action_id: action_id,
    slug: `action_${action_id}`,
    requires_pk: false,
  });

const defaultImplicitActionCreateOptions = {
  insert: true,
  update: true,
  delete: true,
};

const enableImplicitActionsForModel =
  async (modelId: number, options = defaultImplicitActionCreateOptions) =>
  async (dispatch: Dispatch) => {
    const methodsToCreate = Object.entries(options)
      .filter(([, shouldCreate]) => !!shouldCreate)
      .map(([method]) => method);

    const apiCalls = methodsToCreate.map(method =>
      ModelActionsApi.createImplicitAction({
        card_id: modelId,
        slug: method,
        requires_pk: method !== "insert",
      }),
    );

    await Promise.all(apiCalls);

    dispatch({ type: Actions.actionTypes.INVALIDATE_LISTS_ACTION });
  };

const Actions = createEntity({
  name: "actions",
  nameOne: "action",
  path: "/api/action",
  api: {
    create: async ({ model_id, ...params }: ActionParams) => {
      const card = await createAction(params);
      if (card?.action_id && model_id) {
        const association = await associateAction({
          model_id,
          action_id: card.action_id,
        });
        return { ...card, association };
      }
      return card;
    },
    update: updateAction,
    list: async (params: any) => {
      const actions = await ActionsApi.list(params);

      return actions.map((action: WritebackAction) => ({
        ...action,
        id: action.id ?? `implicit-${action.slug}-${action.model_id}`,
        name: action.name ?? action.slug,
      }));
    },
  },
  actions: {
    enableImplicitActionsForModel,
  },
  forms: {
    saveForm,
    updateForm,
  },
});

export default Actions;
