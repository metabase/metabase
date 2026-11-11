import type { SkipToken } from "@reduxjs/toolkit/query";
import type { ComponentType } from "react";

import type * as Urls from "metabase/urls";
import type {
  DataTestId,
  DataTestRun,
  DataTestType,
  RunTransformTestResponse,
  TransformTest,
} from "metabase-types/api";

import type { DataTestRunTriggeredFrom } from "./analytics";

/** The fields of a test that the pages of every test type show. */
export type DataTest = {
  id: DataTestId;
  name: string;
  expectations: readonly unknown[];
  last_run: DataTestRun | null;
};

/** The id of the entity a test checks, such as a transform. */
export type DataTestSubjectId = number;

/** The test of each test type, as its API returns it. */
export type DataTestByType = {
  transform: TransformTest;
};

export type DataTestQueryResult<T> = {
  data?: T;
  isLoading: boolean;
  error?: unknown;
};

export type DataTestRunResult = Pick<RunTransformTestResponse, "status">;

export type DataTestRunMutation = readonly [
  (testId: DataTestId) => PromiseLike<{
    data?: DataTestRunResult;
    error?: unknown;
  }>,
  { isLoading: boolean },
];

export type DataTestReadOnlyResult = {
  readOnly: boolean;
  isLoading: boolean;
  error?: unknown;
};

/**
 * What the generic data test pages need from one test type: its API hooks,
 * URLs, permissions, analytics, copy, and the parts of its pages that show
 * type-specific data.
 */
export type DataTestTypeDefinition<T extends DataTest> = {
  useGetTestQuery: (testId: DataTestId | SkipToken) => DataTestQueryResult<T>;
  useListTestsQuery: (
    subjectId: DataTestSubjectId | SkipToken,
  ) => DataTestQueryResult<T[]>;
  useRunTestMutation: (options?: {
    fixedCacheKey?: string;
  }) => DataTestRunMutation;
  useReadOnly: (
    subjectId: DataTestSubjectId | SkipToken,
  ) => DataTestReadOnlyResult;
  getSubjectId: (test: T) => DataTestSubjectId;
  getTestUrl: (test: T) => string;
  getTestRunsUrl: (test: T, params?: Urls.DataTestRunListParams) => string;
  trackManualRun: (opts: {
    testId: DataTestId;
    triggeredFrom: DataTestRunTriggeredFrom;
  }) => void;
  getListLabel: () => string;
  getRunDescription: () => string;
  SubjectLink: ComponentType<{ test: T }>;
  TestDefinition: ComponentType<{ test: T }>;
};

export type DataTestTypeDefinitions = {
  [K in DataTestType]: DataTestTypeDefinition<DataTestByType[K]>;
};
