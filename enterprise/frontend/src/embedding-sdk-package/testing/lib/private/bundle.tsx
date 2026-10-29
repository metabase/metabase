import { type ReactNode, memo } from "react";

import type { CreateQuestionProps } from "embedding-sdk-bundle/components/public/CreateQuestion";
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
import { formatDate, formatDateRange } from "./dates";
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

function rejectWithNoMock(bundleFunctionName: string) {
  return Promise.reject(
    new Error(
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- developer-facing error naming SDK components
      `No mock for ${bundleFunctionName}. Pass a mock for the data this component requests to MetabaseTestProvider.`,
    ),
  );
}

export function createMockSdkBundle({
  CollectionBrowser,
  CreateDashboardModal,
  CreateQuestion,
  DateRangeCalendar,
  DateRangePopover,
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
  MetabotQuestion,
  StaticDashboard,
  StaticQuestion,
  user = null,
  loginStatus = SIGNED_IN_STATUS,
  applicationName = DEFAULT_APPLICATION_NAME,
  availableFonts = NO_FONTS,
  dataAppQueries = NO_DATA_APP_QUERIES,
  dataAppActions = NO_DATA_APP_ACTIONS,
}: MetabaseTestOptions): MetabaseEmbeddingSdkBundleExports {
  const CreateQuestionOutput = CreateQuestion ?? EmptyOutput;
  const DateRangeCalendarOutput = DateRangeCalendar ?? EmptyOutput;
  const DateRangePopoverOutput = DateRangePopover ?? ChildrenOutput;
  const InteractiveQuestionOutput = InteractiveQuestion ?? ChildrenOutput;
  const StaticQuestionOutput = StaticQuestion ?? ChildrenOutput;

  return {
    CollectionBrowser: CollectionBrowser ?? EmptyOutput,
    CreateDashboardModal: CreateDashboardModal ?? EmptyOutput,
    CreateQuestion: (props?: CreateQuestionProps) => (
      <CreateQuestionOutput {...props} />
    ),
    DateRangeCalendar: (props: DateRangeCalendarProps) => (
      <DateRangeCalendarOutput {...props} />
    ),
    DateRangePopover: (props: DateRangePopoverProps) => (
      <DateRangePopoverOutput {...props} />
    ),
    EditableDashboard: EditableDashboard ?? EmptyOutput,
    InteractiveDashboard: InteractiveDashboard ?? EmptyOutput,
    InteractiveQuestion: Object.assign(
      (props: InteractiveQuestionProps) => (
        <InteractiveQuestionOutput {...props} />
      ),
      INTERACTIVE_QUESTION_SUBCOMPONENTS,
    ),
    ComponentProvider: memo(ChildrenOutput),
    MetabotQuestion: MetabotQuestion ?? EmptyOutput,
    SdkDebugInfo: EmptyOutput,
    StaticDashboard: StaticDashboard ?? EmptyOutput,
    StaticQuestion: Object.assign(
      (props: StaticQuestionProps) => <StaticQuestionOutput {...props} />,
      STATIC_QUESTION_SUBCOMPONENTS,
    ),
    MetabotSubscriber: () => null,
    SdkThemeProviderWithStore: ChildrenOutput,
    getSdkStore: () => {
      throw new Error(
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- developer-facing error naming SDK components
        "MetabaseTestProvider does not support MetabaseProvider. Render the component under test without it.",
      );
    },
    ...createQueryHandlers(dataAppQueries),
    queryQuestion: () => () => rejectWithNoMock("queryQuestion"),
    createDashboard: () => () => rejectWithNoMock("createDashboard"),
    ...createActionHandlers(dataAppActions),
    getApplicationName: () => applicationName,
    getAvailableFonts: () => availableFonts,
    getLoginStatus: () => loginStatus,
    getUser: () => user,
    useInitData: () => undefined,
    useLogVersionInfo: () => undefined,
    validateFunctionSchema: () => ({
      validateParameters: () => ({ success: true }),
      validateReturnValue: () => ({ success: true }),
    }),
    formatDate,
    formatDateRange,
  };
}
