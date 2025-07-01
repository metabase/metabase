import { t } from "ttag";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";

export const SAVED_QUESTIONS_DATABASE = {
  id: SAVED_QUESTIONS_VIRTUAL_DB_ID,
  get name() {
    return t`Saved Questions`;
  },
  is_saved_questions: true,
  features: ["basic-aggregations"],
};
