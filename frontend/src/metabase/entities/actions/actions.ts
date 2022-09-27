import { createEntity } from "metabase/lib/entities";

import type { ActionFormSettings } from "metabase-types/api";

import { ActionsApi, CardApi, ModelActionsApi } from "metabase/services";

import {
  removeOrphanSettings,
  addMissingSettings,
  setParameterTypesFromFieldSettings,
  setTemplateTagTypesFromFieldSettings,
  mapModelActionsToActions,
} from "metabase/entities/actions/utils";
import type Question from "metabase-lib/lib/Question";
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
    list: async (props: any) => {
      const { modelId } = props;

      if (modelId) {
        const modelActions = await ModelActionsApi.getModelActions({
          id: modelId,
        });
        return modelActions.map(mapModelActionsToActions);
      }

      return ActionsApi.list(props);
    },
  },
  forms: {
    saveForm,
    updateForm,
  },
});

export default Actions;
