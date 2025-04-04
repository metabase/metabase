import type { CSSProperties, ErrorInfo, ReactNode, Ref } from "react";

import type { CardSlownessStatus } from "metabase/dashboard/components/DashCard/types";
import type { IconName, IconProps } from "metabase/ui";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import type {
  ClickActionModeGetter,
  ClickObject,
  HoveredObject,
  QueryClickActionsMode,
  VisualizationDefinition,
  VisualizationPassThroughProps,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Card,
  Dashboard,
  DashboardCard,
  RawSeries,
  Series,
  TimelineEvent,
  VisualizationSettings,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

export type StateDispatchProps = {
  dispatch: Dispatch;
};

export type StateProps = {
  fontFamily: string;
  isRawTable: boolean;
  isEmbeddingSdk: boolean;
  scrollToLastColumn: boolean;
};

export type ForwardedRefProps = {
  forwardedRef: Ref<HTMLDivElement>;
};

export type OnChangeCardAndRunOpts = {
  nextCard: Card;
  previousCard: Card;
  objectId?: number;
};

export type VisualizationOwnProps = {
  actionButtons?: ReactNode | null;
  className?: string;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  error?: ReactNode;
  errorIcon?: IconName;
  errorMessageOverride?: string;
  expectedDuration?: number;
  getExtraDataForClick?: (
    clicked: ClickObject | null,
  ) => Record<string, unknown>;
  getHref?: () => string | undefined;
  gridSize?: {
    width: number;
    height: number;
  };
  gridUnit?: number;
  handleVisualizationClick?: (clicked: ClickObject | null) => void;
  headerIcon?: IconProps;
  width?: number | null;
  height?: number | null;
  isAction?: boolean;
  isDashboard?: boolean;
  isMobile?: boolean;
  isSlow?: CardSlownessStatus;
  isVisible?: boolean;
  metadata?: Metadata;
  mode?: ClickActionModeGetter | Mode | QueryClickActionsMode;
  query?: NativeQuery;
  rawSeries?: RawSeries;
  replacementContent?: JSX.Element | null;
  selectedTimelineEventIds?: number[];
  settings?: VisualizationSettings;
  showTitle?: boolean;
  showWarnings?: boolean;
  style?: CSSProperties;
  timelineEvents?: TimelineEvent[];
  uuid?: string;
  token?: string;
  onOpenChartSettings?: (data: {
    initialChartSettings: { section: string };
    showSidebarTitle?: boolean;
  }) => void;
  onChangeCardAndRun?: ((opts: OnChangeCardAndRunOpts) => void) | null;
  onHeaderColumnReorder?: (columnName: string) => void;
  onChangeLocation?: (location: Location) => void;
  onUpdateQuestion?: () => void;
  onUpdateVisualizationSettings?: (
    settings: VisualizationSettings,
    question?: Question,
  ) => void;
  onUpdateWarnings?: (warnings: string[]) => void;
} & VisualizationPassThroughProps;

export type VisualizationProps = StateDispatchProps &
  StateProps &
  ForwardedRefProps &
  VisualizationOwnProps;

export type VisualizationState = {
  clicked: ClickObject | null;
  computedSettings: Record<string, string>;
  error: ReactNode;
  genericError: ErrorInfo | null;
  getHref: (() => string) | undefined;
  hovered: HoveredObject | null;
  series: Series | null;
  visualization: VisualizationDefinition | null;
  warnings: string[];
  _lastProps?: VisualizationProps;
};
