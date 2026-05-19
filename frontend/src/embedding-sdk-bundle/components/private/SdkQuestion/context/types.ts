import type { PropsWithChildren } from "react";

import type { LoadQuestionHookResult } from "embedding-sdk-bundle/hooks/private/use-load-question";
import type { SdkEntityToken } from "embedding-sdk-bundle/types";
import type { SdkCollectionId } from "embedding-sdk-bundle/types/collection";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import type {
  LoadSdkQuestionParams,
  MetabaseQuestion,
  SdkQuestionId,
  SqlParameterChangePayload,
  SqlParameterValues,
} from "embedding-sdk-bundle/types/question";
import type {
  EmbeddingDataPicker,
  EmbeddingEntityType,
} from "metabase/redux/store/embedding-data-picker";
import type {
  ClickActionModeGetter,
  ClickActionsMode,
  QueryClickActionsMode,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type { Card, CardDisplayType, DashboardId } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

type SdkQuestionConfig = {
  /**
   * An array that specifies which entity types are available in the data picker
   */
  entityTypes?: EmbeddingEntityType[];

  /**
   * Controls the menu for selecting data sources in questions. You can opt for the full data picker by setting `dataPicker = "staged"`.
   */
  dataPicker?: EmbeddingDataPicker;

  /**
   * Whether to show the save button.
   **/
  isSaveEnabled?: boolean;

  /**
   * Initial values for SQL parameters, slug-keyed. Applied once on mount; user widget edits afterwards are not reflected back to the host.
   * <br/>
   * For each parameter:
   * <br/>
   * - set to a value: that value is applied.
   * <br/>
   * - set to `null`: strictly cleared, ignoring the parameter's default.
   * <br/>
   * - omitted (or set to `undefined`): falls back to the parameter's default (or `null` if it has no default).
   **/
  initialSqlParameters?: SqlParameterValues;

  /**
   * Controlled SQL parameter values, slug-keyed. On every render, this object replaces the question's parameter values:
   * <br/>
   * - a parameter set to a value uses that value.
   * <br/>
   * - a parameter set to `null` is cleared, even if it has a default.
   * <br/>
   * - a parameter omitted from the object (or set to `undefined`) uses its default (or `null` if it has no default).
   * <br/>
   * <br/>
   * Pair with `onSqlParametersChange` to stay in sync with user edits.
   **/
  sqlParameters?: SqlParameterValues;

  /**
   * Fires on SQL parameters change. The payload's `source` distinguishes the initial state on load (`'initial-state'`), user edits in the UI (`'manual-change'`), and auto-updates (`'auto-change'`).
   **/
  onSqlParametersChange?: (payload: SqlParameterChangePayload) => void;

  /**
   * A list of parameters to hide.
   **/
  hiddenParameters?: string[];

  /**
   * Enables the ability to download results in the question.
   */
  withDownloads?: boolean;

  /**
   * Enables the ability to set up alerts on the question.
   */
  withAlerts?: boolean;

  /**
   * The collection to save the question to. This will hide the collection picker from the save modal. Only applicable to interactive questions.
   */
  targetCollection?: SdkCollectionId;

  /**
   * Additional mapper function to override or add drill-down menu
   */
  componentPlugins?: MetabasePluginsConfig;

  /**
   * A callback function that triggers before saving. Only relevant when `isSaveEnabled = true`
   */
  onBeforeSave?: (
    question: MetabaseQuestion | undefined,
    context: { isNewQuestion: boolean },
  ) => Promise<void>;

  /**
   * A callback function that triggers when a user saves the question. Only relevant when `isSaveEnabled = true`
   */
  onSave?: (
    question: MetabaseQuestion,
    context: { isNewQuestion: boolean; dashboardTabId?: number | undefined },
  ) => void;

  /**
   * A callback function that triggers when a question is updated, including when a user clicks the `Visualize` button in the question editor
   */
  onRun?: (question: MetabaseQuestion | undefined) => void;

  /**
   * A callback function that triggers when a user clicks the back button.
   */
  onNavigateBack?: () => void;

  /**
   * @internal
   *
   * When provided, this dashboard will be used to navigate back to the dashboard from other view
   * instead of the state from Redux in `qb.parentEntity.dashboardId`
   */
  backToDashboard?: {
    id: DashboardId;
    model: "dashboard";
    name: string;
  };

  /**
   * A callback function that triggers when the visualization type changes.
   *
   * @param display the new display type
   */
  onVisualizationChange?: (display: CardDisplayType) => void;
};

export type QuestionMockLocationParameters = {
  location: { search: string; hash: string; pathname: string };
  params: { slug?: string };
};

/**
 * @inline
 */
export type SdkQuestionEntityInternalProps = {
  questionId?: SdkQuestionId | null;
  token?: SdkEntityToken | null;
};

export type SdkQuestionProviderProps = PropsWithChildren<
  SdkQuestionConfig &
    Omit<LoadSdkQuestionParams, "questionId"> &
    SdkQuestionEntityInternalProps & {
      /**
       * @internal
       */
      getClickActionMode?: ClickActionModeGetter | undefined;

      /**
       * @internal
       */
      navigateToNewCard?: Nullable<LoadQuestionHookResult["navigateToNewCard"]>;

      /**
       * Called when a drill-through action is about to navigate to a new card.
       * Receives the navigation params and a `defaultNavigate` callback.
       * Call `defaultNavigate()` to allow normal navigation, or omit it to intercept.
       *
       * @internal
       */
      onDrillThrough?: (
        params: {
          drillName: string | undefined;
          nextCard: Card;
        },
        defaultNavigate: () => Promise<void>,
      ) => Promise<void>;
    }
>;

export type SdkQuestionContextType = Omit<
  LoadQuestionHookResult,
  "loadAndQueryQuestion"
> &
  Pick<
    SdkQuestionConfig,
    | "onRun"
    | "onNavigateBack"
    | "isSaveEnabled"
    | "targetCollection"
    | "withDownloads"
    | "withAlerts"
    | "backToDashboard"
    | "hiddenParameters"
    | "onVisualizationChange"
  > & {
    plugins: SdkQuestionConfig["componentPlugins"] | null;
    mode: QueryClickActionsMode | ClickActionsMode | null | undefined;
    originalId: SdkQuestionId | null;
    token: EntityToken | null | undefined;
    lastVisibleStageIndex: number;
    updateAndNormalizeQuestion: LoadQuestionHookResult["updateQuestion"];
    resetQuestion: () => void;
    onReset: () => void;
    onCreate: (question: Question) => Promise<Question>;
    onSave: (question: Question) => Promise<void>;
  };
