import { t } from "ttag";

import { skipToken, useGetTransformQuery } from "metabase/api";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import * as Urls from "metabase/urls";
import {
  useGetTransformTestQuery,
  useListTransformTestsQuery,
  useRunTransformTestMutation,
} from "metabase-enterprise/api";
import type { TransformId, TransformTest } from "metabase-types/api";

import { trackTransformTestTriggerManualRun } from "../../analytics";
import type {
  DataTestReadOnlyResult,
  DataTestTypeDefinition,
} from "../../types";

import { TransformLink } from "./TransformLink";
import { TransformTestDefinition } from "./TransformTestDefinition";

function useListTransformTestsBySubjectQuery(
  transformId: TransformId | typeof skipToken,
) {
  return useListTransformTestsQuery(
    transformId === skipToken ? skipToken : { "transform-id": transformId },
  );
}

function useTransformReadOnly(
  transformId: TransformId | typeof skipToken,
): DataTestReadOnlyResult {
  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(transformId);
  const { readOnly, isLoadingDatabases, databasesError } =
    useTransformPermissions({ transform });

  return {
    readOnly: readOnly ?? false,
    isLoading: isLoadingTransform || isLoadingDatabases,
    error: transformError ?? databasesError,
  };
}

export const transformTestDefinition: DataTestTypeDefinition<TransformTest> = {
  useGetTestQuery: useGetTransformTestQuery,
  useListTestsQuery: useListTransformTestsBySubjectQuery,
  useRunTestMutation: useRunTransformTestMutation,
  useReadOnly: useTransformReadOnly,
  getSubjectId: (test) => test.transform_id,
  getTestUrl: (test) => Urls.transformTest(test.transform_id, test.id),
  getTestRunsUrl: (test, params) =>
    Urls.transformTestRuns(test.transform_id, test.id, params),
  trackManualRun: trackTransformTestTriggerManualRun,
  getListLabel: () => t`Transform tests`,
  getRunDescription: () =>
    t`Runs the transform on the test data and checks its output. The real tables aren't touched.`,
  SubjectLink: TransformLink,
  TestDefinition: TransformTestDefinition,
};
