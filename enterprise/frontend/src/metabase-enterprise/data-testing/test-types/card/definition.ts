import { t } from "ttag";

import { skipToken } from "metabase/api";
import * as Urls from "metabase/urls";
import {
  useGetCardTestQuery,
  useListCardTestsQuery,
  useRunCardTestMutation,
} from "metabase-enterprise/api";
import type { CardId, CardTest } from "metabase-types/api";

import type {
  DataTestReadOnlyResult,
  DataTestTypeDefinition,
  DataTestUrls,
} from "../../types";

import { CardLink } from "./CardLink";
import { CardTestDefinition } from "./CardTestDefinition";

function useListCardTestsBySubjectQuery(cardId: CardId | typeof skipToken) {
  return useListCardTestsQuery(
    cardId === skipToken ? skipToken : { "card-id": cardId },
  );
}

function useCardReadOnly({
  tests,
}: {
  tests: readonly CardTest[];
}): DataTestReadOnlyResult {
  return { readOnly: !tests.some((test) => test.can_run) };
}

const CARD_TEST_URLS: DataTestUrls<CardTest> = {
  getTestUrl: (test) => Urls.dataStudioMetricTest(test.card_id, test.id),
  getTestRunsUrl: (test, params) =>
    Urls.dataStudioMetricTestRuns(test.card_id, test.id, params),
};

export const cardTestDefinition: DataTestTypeDefinition<CardTest> = {
  useGetTestQuery: useGetCardTestQuery,
  useListTestsQuery: useListCardTestsBySubjectQuery,
  useRunTestMutation: useRunCardTestMutation,
  useReadOnly: useCardReadOnly,
  getSubjectId: (test) => test.card_id,
  useTestUrls: () => CARD_TEST_URLS,
  testType: "card",
  getListLabel: () => t`Tests`,
  getRunDescription: () =>
    t`Runs the query on the test data and checks the rows it returns. The real tables aren't touched.`,
  SubjectLink: CardLink,
  TestDefinition: CardTestDefinition,
};
