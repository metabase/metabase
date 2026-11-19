import { t } from "ttag";

import { skipToken, useGetActionQuery } from "metabase/api";
import { useListDatabasesQuery } from "metabase/api/database";
import {
  hasActionsEnabled,
  hasNativeWritePermissions,
} from "metabase/common/utils/database";
import * as Urls from "metabase/urls";
import {
  useGetActionTestQuery,
  useListActionTestsQuery,
  useRunActionTestMutation,
} from "metabase-enterprise/api";
import type { ActionTest, WritebackActionId } from "metabase-types/api";

import type {
  DataTestReadOnlyResult,
  DataTestTypeDefinition,
} from "../../types";

import { ActionLink } from "./ActionLink";
import { ActionTestDefinition } from "./ActionTestDefinition";

function useListActionTestsBySubjectQuery(
  actionId: WritebackActionId | typeof skipToken,
) {
  return useListActionTestsQuery(
    actionId === skipToken ? skipToken : { "action-id": actionId },
  );
}

function useActionReadOnly(
  actionId: WritebackActionId | typeof skipToken,
): DataTestReadOnlyResult {
  const {
    data: action,
    isLoading: isLoadingAction,
    error: actionError,
  } = useGetActionQuery(actionId === skipToken ? skipToken : { id: actionId });
  const {
    data: databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();
  const database = databases?.data.find(
    (database) => database.id === action?.database_id,
  );

  return {
    readOnly:
      database == null ||
      !hasNativeWritePermissions(database) ||
      !hasActionsEnabled(database),
    isLoading: isLoadingAction || isLoadingDatabases,
    error: actionError ?? databasesError,
  };
}

export const actionTestDefinition: DataTestTypeDefinition<ActionTest> = {
  useGetTestQuery: useGetActionTestQuery,
  useListTestsQuery: useListActionTestsBySubjectQuery,
  useRunTestMutation: useRunActionTestMutation,
  useReadOnly: useActionReadOnly,
  getSubjectId: (test) => test.action_id,
  getTestUrl: (test) => Urls.dataStudioActionTest(test.action_id, test.id),
  getTestRunsUrl: (test, params) =>
    Urls.dataStudioActionTestRuns(test.action_id, test.id, params),
  testType: "action",
  getListLabel: () => t`Tests`,
  getRunDescription: () =>
    t`Runs the action on the test data and checks the tables afterwards. The real tables aren't touched.`,
  SubjectLink: ActionLink,
  TestDefinition: ActionTestDefinition,
};
