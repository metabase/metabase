import dayjs from "dayjs";
import { type ReactNode, memo } from "react";

import type { DateRangeValue } from "embedding-sdk-bundle/components/public/DateRangeCalendar/DateRangeCalendar";
import type { InteractiveQuestionComponents } from "embedding-sdk-bundle/components/public/InteractiveQuestion/InteractiveQuestion";
import type { StaticQuestionComponents } from "embedding-sdk-bundle/components/public/StaticQuestion/StaticQuestion";
import type {
  FormatDateOptions,
  FormatDateRangeOptions,
} from "embedding-sdk-bundle/lib/format-date-range";
import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import type { LoginStatus } from "embedding-sdk-bundle/types/user";

const DEFAULT_DATE_FORMAT = "MMMM D, YYYY";
const DEFAULT_DATE_RANGE_SEPARATOR = "–";

// eslint-disable-next-line metabase/no-literal-metabase-strings -- the default name a real instance reports
const APPLICATION_NAME = "Metabase";
const AVAILABLE_FONTS: string[] = [];
const LOGIN_STATUS: LoginStatus = { status: "success" };

const MOCK_SCHEMA: FunctionSchema = { input: [] };

type ChildrenProps = { children?: ReactNode };

const EmptyOutput = () => <></>;

const ChildrenOutput = ({ children }: ChildrenProps) => <>{children}</>;

const createMockComponent = () =>
  Object.assign(() => <></>, { schema: MOCK_SCHEMA });

const createMockLayoutComponent = () =>
  Object.assign(({ children }: ChildrenProps) => <>{children}</>, {
    schema: MOCK_SCHEMA,
  });

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

const createNoMockError = (bundleFunctionName: string) =>
  new Error(
    `No mock for ${bundleFunctionName}. Mock the data this component requests before rendering it.`,
  );

const rejectWithNoMock = (bundleFunctionName: string) => () => () =>
  Promise.reject(createNoMockError(bundleFunctionName));

const isValidDate = (value: string | null | undefined): value is string =>
  value != null && dayjs(value).isValid();

const formatDate = (
  value: string | null | undefined,
  { format = DEFAULT_DATE_FORMAT }: FormatDateOptions = {},
): string => (isValidDate(value) ? dayjs(value).format(format) : "");

const formatDateRange = (
  value: DateRangeValue | null | undefined,
  {
    format = DEFAULT_DATE_FORMAT,
    separator = DEFAULT_DATE_RANGE_SEPARATOR,
  }: FormatDateRangeOptions = {},
): string =>
  (value ?? [])
    .map((date) => formatDate(date, { format }))
    .filter((label) => label !== "")
    .join(separator);

export const MOCK_SDK_BUNDLE: MetabaseEmbeddingSdkBundleExports = {
  CollectionBrowser: createMockComponent(),
  CreateDashboardModal: createMockComponent(),
  CreateQuestion: createMockComponent(),
  DateRangeCalendar: EmptyOutput,
  DateRangePopover: ChildrenOutput,
  EditableDashboard: createMockComponent(),
  InteractiveDashboard: createMockComponent(),
  InteractiveQuestion: Object.assign(
    createMockLayoutComponent(),
    INTERACTIVE_QUESTION_SUBCOMPONENTS,
  ),
  ComponentProvider: memo(ChildrenOutput),
  MetabotQuestion: EmptyOutput,
  SdkDebugInfo: createMockComponent(),
  StaticDashboard: createMockComponent(),
  StaticQuestion: Object.assign(
    createMockLayoutComponent(),
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
  resolveDatasetQuery: rejectWithNoMock("resolveDatasetQuery"),
  queryDataset: rejectWithNoMock("queryDataset"),
  queryQuestion: rejectWithNoMock("queryQuestion"),
  createDashboard: rejectWithNoMock("createDashboard"),
  executeAction: rejectWithNoMock("executeAction"),
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
