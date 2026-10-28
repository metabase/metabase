import dayjs from "dayjs";
import { type ReactNode, memo } from "react";

import type { DateRangeValue } from "embedding-sdk-bundle/components/public/DateRangeCalendar/DateRangeCalendar";
import type { InteractiveQuestionComponents } from "embedding-sdk-bundle/components/public/InteractiveQuestion/InteractiveQuestion";
import type { StaticQuestionComponents } from "embedding-sdk-bundle/components/public/StaticQuestion/StaticQuestion";
import type {
  FormatDateOptions,
  FormatDateRangeOptions,
} from "embedding-sdk-bundle/lib/format-date-range";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import type { LoginStatus } from "embedding-sdk-bundle/types/user";

import {
  COLLECTION_BROWSER_MOCK,
  CREATE_DASHBOARD_MODAL_MOCK,
  CREATE_QUESTION_MOCK,
  DATE_RANGE_CALENDAR_MOCK,
  DATE_RANGE_POPOVER_MOCK,
  EDITABLE_DASHBOARD_MOCK,
  INTERACTIVE_DASHBOARD_MOCK,
  INTERACTIVE_QUESTION_MOCK,
  METABOT_QUESTION_MOCK,
  STATIC_DASHBOARD_MOCK,
  STATIC_QUESTION_MOCK,
} from "./component-mocks";
import { getMockSdkRegistry } from "./mock-sdk-registry";

type ChildrenProps = { children?: ReactNode };

function EmptyOutput() {
  return <></>;
}

function createChildrenOutput() {
  function ChildrenOutput({ children }: ChildrenProps) {
    return <>{children}</>;
  }
  return ChildrenOutput;
}

function createNoMockError(bundleFunctionName: string) {
  return new Error(
    `No mock for ${bundleFunctionName}. Mock the data this component requests before rendering it.`,
  );
}

function rejectWithNoMock(bundleFunctionName: string) {
  return Promise.reject(createNoMockError(bundleFunctionName));
}

function formatDate(
  value: string | null | undefined,
  { format = DEFAULT_DATE_FORMAT }: FormatDateOptions = {},
): string {
  if (value == null) {
    return "";
  }

  const date = dayjs(value);
  return date.isValid() ? date.format(format) : "";
}

function formatDateRange(
  value: DateRangeValue | null | undefined,
  {
    format = DEFAULT_DATE_FORMAT,
    separator = DEFAULT_DATE_RANGE_SEPARATOR,
  }: FormatDateRangeOptions = {},
): string {
  return (value ?? [])
    .map((date) => formatDate(date, { format }))
    .filter((label) => label !== "")
    .join(separator);
}

const DEFAULT_DATE_FORMAT = "MMMM D, YYYY";
const DEFAULT_DATE_RANGE_SEPARATOR = "–";

// eslint-disable-next-line metabase/no-literal-metabase-strings -- the default name a real instance reports
const APPLICATION_NAME = "Metabase";
const AVAILABLE_FONTS: string[] = [];
const LOGIN_STATUS: LoginStatus = { status: "success" };

const STATIC_QUESTION_SUBCOMPONENTS = {
  Filter: EmptyOutput,
  FilterDropdown: EmptyOutput,
  ResetButton: EmptyOutput,
  RefreshButton: EmptyOutput,
  Title: EmptyOutput,
  Summarize: EmptyOutput,
  SummarizeDropdown: EmptyOutput,
  QuestionVisualization: EmptyOutput,
  ChartTypeSelector: EmptyOutput,
  ChartTypeDropdown: EmptyOutput,
  QuestionSettings: EmptyOutput,
  QuestionSettingsDropdown: EmptyOutput,
  Breakout: EmptyOutput,
  BreakoutDropdown: EmptyOutput,
  DownloadWidget: EmptyOutput,
  DownloadWidgetDropdown: EmptyOutput,
  AlertsButton: EmptyOutput,
  SqlParametersList: EmptyOutput,
} satisfies Record<keyof StaticQuestionComponents, unknown>;

const INTERACTIVE_QUESTION_SUBCOMPONENTS = {
  ...STATIC_QUESTION_SUBCOMPONENTS,
  BackButton: EmptyOutput,
  NavigationBackButton: EmptyOutput,
  Notebook: EmptyOutput,
  Editor: EmptyOutput,
  NotebookButton: EmptyOutput,
  EditorButton: EmptyOutput,
  VisualizationButton: EmptyOutput,
  SaveQuestionForm: EmptyOutput,
  SaveButton: EmptyOutput,
} satisfies Record<keyof InteractiveQuestionComponents, unknown>;

export const MOCK_SDK_BUNDLE: MetabaseEmbeddingSdkBundleExports = {
  CollectionBrowser: COLLECTION_BROWSER_MOCK.Component,
  CreateDashboardModal: CREATE_DASHBOARD_MODAL_MOCK.Component,
  CreateQuestion: CREATE_QUESTION_MOCK.Component,
  DateRangeCalendar: DATE_RANGE_CALENDAR_MOCK.Component,
  DateRangePopover: DATE_RANGE_POPOVER_MOCK.Component,
  EditableDashboard: EDITABLE_DASHBOARD_MOCK.Component,
  InteractiveDashboard: INTERACTIVE_DASHBOARD_MOCK.Component,
  InteractiveQuestion: Object.assign(
    INTERACTIVE_QUESTION_MOCK.Component,
    INTERACTIVE_QUESTION_SUBCOMPONENTS,
  ),
  ComponentProvider: memo(createChildrenOutput()),
  MetabotQuestion: METABOT_QUESTION_MOCK.Component,
  SdkDebugInfo: EmptyOutput,
  StaticDashboard: STATIC_DASHBOARD_MOCK.Component,
  StaticQuestion: Object.assign(
    STATIC_QUESTION_MOCK.Component,
    STATIC_QUESTION_SUBCOMPONENTS,
  ),
  MetabotSubscriber: () => null,
  SdkThemeProviderWithStore: createChildrenOutput(),
  getSdkStore: () => {
    throw new Error(
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- developer-facing error naming SDK components
      "MetabaseTestProvider does not support MetabaseProvider. Render the component under test without it.",
    );
  },
  resolveDatasetQuery:
    (store) =>
    (...args) => {
      const handler = getMockSdkRegistry().handlers.resolveDatasetQuery;
      return handler
        ? handler(store)(...args)
        : rejectWithNoMock("resolveDatasetQuery");
    },
  queryDataset:
    (store) =>
    (...args) => {
      const handler = getMockSdkRegistry().handlers.queryDataset;
      return handler
        ? handler(store)(...args)
        : rejectWithNoMock("queryDataset");
    },
  queryQuestion:
    (store) =>
    (...args) => {
      const handler = getMockSdkRegistry().handlers.queryQuestion;
      return handler
        ? handler(store)(...args)
        : rejectWithNoMock("queryQuestion");
    },
  createDashboard:
    (store) =>
    (...args) => {
      const handler = getMockSdkRegistry().handlers.createDashboard;
      return handler
        ? handler(store)(...args)
        : rejectWithNoMock("createDashboard");
    },
  executeAction:
    (store) =>
    (...args) => {
      const handler = getMockSdkRegistry().handlers.executeAction;
      return handler
        ? handler(store)(...args)
        : rejectWithNoMock("executeAction");
    },
  getApplicationName: () => APPLICATION_NAME,
  getAvailableFonts: () => AVAILABLE_FONTS,
  getLoginStatus: () => LOGIN_STATUS,
  getUser: () => null,
  useInitData: () => undefined,
  useLogVersionInfo: () => undefined,
  validateFunctionSchema: () => ({
    validateParameters: () => ({ success: true }),
    validateReturnValue: () => ({ success: true }),
  }),
  formatDate,
  formatDateRange,
};
