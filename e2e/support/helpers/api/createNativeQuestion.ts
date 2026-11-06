import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import type { Card, DatabaseId } from "metabase-types/api";

import {
  type Options,
  type QuestionDetails,
  logAction,
  question,
} from "./createQuestion";

export type NativeQuestionDetails = Omit<QuestionDetails, "dataset_query"> & {
  /**
   * Defaults to SAMPLE_DB_ID.
   */
  database?: DatabaseId | null;
  // e2e tests still pass hand-written legacy MBQL; migrate them to the Lib test spec and drop `any`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  native: any;
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
