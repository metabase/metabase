import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import type { Card, DatasetQuery, NativeQuery } from "metabase-types/api";

import {
  logAction,
  question,
  type Options,
  type QuestionDetails,
} from "./createQuestion";

export type NativeQuestionDetails = Omit<QuestionDetails, "dataset_query"> & {
  /**
   * Defaults to SAMPLE_DB_ID.
   */
  database?: DatasetQuery["database"];
  native: NativeQuery;
};

export const createNativeQuestion = (
  questionDetails: NativeQuestionDetails,
  options?: Options,
): Cypress.Chainable<Cypress.Response<Card>> => {
  const { database = SAMPLE_DB_ID, name, native } = questionDetails;

  if (!native) {
    throw new Error('"native" attribute missing in questionDetails');
  }

  logAction("Create a native question", name);

  return question(
    {
      ...questionDetails,
      dataset_query: { type: "native", native, database },
    },
    options,
  );
};
