import { createEntity } from "metabase/lib/entities";

import type { ActionFormSettings } from "metabase-types/api";

import { CardApi } from "metabase/services";

import {
  removeOrphanSettings,
  addMissingSettings,
  setParameterTypesFromFieldSettings,
  setTemplateTagTypesFromFieldSettings,
} from "metabase/entities/actions/utils";
import type Question from "metabase-lib/lib/Question";
import { saveForm } from "./forms";

type ActionParams = {
  name: string;
  description?: string;
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

const Actions = createEntity({
  name: "actions",
  nameOne: "action",
  path: "/api/action",
  api: {
    create: createAction,
    update: updateAction,
  },
  forms: {
    saveForm,
  },
});

export default Actions;
