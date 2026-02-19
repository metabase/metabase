import type { PropsWithChildren } from "react";

import type { LoadQuestionHookResult } from "embedding-sdk-bundle/hooks/private/use-load-question";
import type { SdkEntityToken } from "embedding-sdk-bundle/types";
import type { SdkCollectionId } from "embedding-sdk-bundle/types/collection";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import type {
  LoadSdkQuestionParams,
  MetabaseQuestion,
  SdkQuestionId,
  SqlParameterValues,
} from "embedding-sdk-bundle/types/question";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import type {
  ClickActionModeGetter,
  QueryClickActionsMode,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType, DashboardId } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";
import type { ModularEmbeddingEntityType } from "metabase-types/store/embedding-data-picker";

type SdkQuestionConfig = {
  /**
   * An array that specifies which entity types are available in the data picker
   */
  entityTypes?: ModularEmbeddingEntityType[];

  /**
   * Whether to show the save button.
   **/
  isSaveEnabled?: boolean;

  /**
   * Initial values for the SQL parameters.
   **/
  initialSqlParameters?: SqlParameterValues;

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
    mode: QueryClickActionsMode | Mode | null | undefined;
    originalId: SdkQuestionId | null;
    token: EntityToken | null | undefined;
    resetQuestion: () => void;
    onReset: () => void;
    onCreate: (question: Question) => Promise<Question>;
    onSave: (question: Question) => Promise<void>;
  };
