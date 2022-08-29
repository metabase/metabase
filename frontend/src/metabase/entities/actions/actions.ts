import { createEntity } from "metabase/lib/entities";

import { saveForm } from "./forms";

import type Question from "metabase-lib/lib/Question";
import { CardApi } from "metabase/services";
import { ActionFormSettings } from "metabase/writeback/types";

type ActionParams = {
  name: string;
  description?: string;
  collection_id?: number;
  question: Question;
  formSettings: ActionFormSettings;
};

const createAction = async ({
  name,
  description,
  question,
  collection_id,
  formSettings = {},
}: ActionParams) => {
  return CardApi.create({
    ...question.card(),
    name,
    description,
    parameters: question.parameters(),
    is_write: true,
    display: "table",
    visualization_settings: formSettings,
    collection_id,
  });
};

const Actions = createEntity({
  name: "actions",
  nameOne: "action",
  path: "/api/action",
  api: {
    create: createAction,
  },
  forms: {
    saveForm,
  },
});

export default Actions;
