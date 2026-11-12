import { type ReactNode, memo } from "react";

import type { DateRangeCalendarProps } from "embedding-sdk-bundle/components/public/DateRangeCalendar/DateRangeCalendar";
import type { DateRangePopoverProps } from "embedding-sdk-bundle/components/public/DateRangePopover/DateRangePopover";
import type {
  InteractiveQuestionComponents,
  InteractiveQuestionProps,
} from "embedding-sdk-bundle/components/public/InteractiveQuestion/InteractiveQuestion";
import type {
  StaticQuestionComponents,
  StaticQuestionProps,
} from "embedding-sdk-bundle/components/public/StaticQuestion/StaticQuestion";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import type { LoginStatus } from "embedding-sdk-bundle/types/user";
import type { MetabaseTestOptions } from "embedding-sdk-package/testing/components/MetabaseTestProvider";

import { type MetabaseActionMock, createActionHandlers } from "./actions";
import { type MetabaseQueryMock, createQueryHandlers } from "./queries";

type ChildrenProps = { children?: ReactNode };

// eslint-disable-next-line metabase/no-literal-metabase-strings -- the default name a real instance reports
const DEFAULT_APPLICATION_NAME = "Metabase";
const NO_FONTS: string[] = [];
const NO_DATA_APP_QUERIES: MetabaseQueryMock[] = [];
const NO_DATA_APP_ACTIONS: MetabaseActionMock[] = [];
const SIGNED_IN_STATUS: LoginStatus = { status: "success" };

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

function EmptyOutput() {
  return <></>;
}

function ChildrenOutput({ children }: ChildrenProps) {
  return <>{children}</>;
}

function throwNoMock(bundleExportName: string): never {
  throw new Error(`No mock for ${bundleExportName}.`);
}

export function createMockSdkBundle({
  CollectionBrowser = EmptyOutput,
  CreateDashboardModal = EmptyOutput,
  CreateQuestion = EmptyOutput,
  DateRangeCalendar = EmptyOutput,
  DateRangePopover = ChildrenOutput,
  EditableDashboard = EmptyOutput,
  InteractiveDashboard = EmptyOutput,
  InteractiveQuestion = ChildrenOutput,
  MetabotQuestion = EmptyOutput,
  StaticDashboard = EmptyOutput,
  StaticQuestion = ChildrenOutput,
  user = null,
  loginStatus = SIGNED_IN_STATUS,
  applicationName = DEFAULT_APPLICATION_NAME,
  availableFonts = NO_FONTS,
  dataAppQueries = NO_DATA_APP_QUERIES,
  dataAppActions = NO_DATA_APP_ACTIONS,
}: MetabaseTestOptions): MetabaseEmbeddingSdkBundleExports {
  return {
    CollectionBrowser,
    CreateDashboardModal,
    CreateQuestion,
    DateRangeCalendar: (props: DateRangeCalendarProps) => (
      <DateRangeCalendar {...props} />
    ),
    DateRangePopover: (props: DateRangePopoverProps) => (
      <DateRangePopover {...props} />
    ),
    EditableDashboard,
    InteractiveDashboard,
    InteractiveQuestion: Object.assign(
      (props: InteractiveQuestionProps) => <InteractiveQuestion {...props} />,
      INTERACTIVE_QUESTION_SUBCOMPONENTS,
    ),
    ComponentProvider: memo(ChildrenOutput),
    MetabotQuestion,
    SdkDebugInfo: EmptyOutput,
    StaticDashboard,
    StaticQuestion: Object.assign(
      (props: StaticQuestionProps) => <StaticQuestion {...props} />,
      STATIC_QUESTION_SUBCOMPONENTS,
    ),
    MetabotSubscriber: () => throwNoMock("MetabotSubscriber"),
    SdkThemeProviderWithStore: () => throwNoMock("SdkThemeProviderWithStore"),
    getSdkStore: () => throwNoMock("getSdkStore"),
    ...createQueryHandlers(dataAppQueries),
    queryQuestion: () => () => throwNoMock("queryQuestion"),
    createDashboard: () => () => throwNoMock("createDashboard"),
    ...createActionHandlers(dataAppActions),
    getApplicationName: () => applicationName,
    getAvailableFonts: () => availableFonts,
    getLoginStatus: () => loginStatus,
    getUser: () => user,
    useInitData: () => throwNoMock("useInitData"),
    useLogVersionInfo: () => throwNoMock("useLogVersionInfo"),
    validateFunctionSchema: () => throwNoMock("validateFunctionSchema"),
    formatDate: (value) => value ?? "",
    formatDateRange: (value) => value?.join(" - ") ?? "",
  };
}
