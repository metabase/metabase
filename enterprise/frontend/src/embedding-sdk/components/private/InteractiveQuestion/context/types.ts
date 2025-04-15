import type { PropsWithChildren } from "react";

import type { MetabasePluginsConfig } from "embedding-sdk";
import type { LoadQuestionHookResult } from "embedding-sdk/hooks/private/use-load-question";
import type { SdkCollectionId } from "embedding-sdk/types/collection";
import type {
  LoadSdkQuestionParams,
  SdkQuestionId,
} from "embedding-sdk/types/question";
import type { MetabaseQuestion } from "metabase/embedding-sdk/types/question";
import type { NotebookProps as QBNotebookProps } from "metabase/querying/notebook/components/Notebook";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import type Question from "metabase-lib/v1/Question";
import type { ParameterId } from "metabase-types/api";

export type EntityTypeFilterKeys = "table" | "question" | "model" | "metric";

export type ParameterValues = Record<ParameterId, string | number>;

type InteractiveQuestionConfig = {
  /**
   * An array that specifies which entity types are available in the data picker
   */
  entityTypeFilter?: EntityTypeFilterKeys[];

  /**
   * Whether to show the save button.
   **/
  isSaveEnabled?: boolean;

  /**
   * Initial values for the SQL parameters.
   **/
  initialSqlParameters?: ParameterValues;

  /**
   * Enables the ability to download results in the interactive question.
   */
  withDownloads?: boolean;

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
    question: MetabaseQuestion | undefined,
    context: { isNewQuestion: boolean },
  ) => void;

  /**
   * A callback function that triggers when a user clicks the back button.
   */
  onNavigateBack?: () => void;
};

export type QuestionMockLocationParameters = {
  location: { search: string; hash: string; pathname: string };
  params: { slug?: string };
};

export type InteractiveQuestionProviderProps = PropsWithChildren<
  InteractiveQuestionConfig &
    Omit<LoadSdkQuestionParams, "questionId"> & {
      questionId: SdkQuestionId | null;
      variant?: "static" | "interactive";
    }
>;

export type InteractiveQuestionContextType = Omit<
  LoadQuestionHookResult,
  "loadAndQueryQuestion"
> &
  Pick<
    InteractiveQuestionConfig,
    "onNavigateBack" | "isSaveEnabled" | "targetCollection" | "withDownloads"
  > &
  Pick<InteractiveQuestionProviderProps, "variant"> &
  Pick<QBNotebookProps, "modelsFilterList"> & {
    plugins: InteractiveQuestionConfig["componentPlugins"] | null;
    mode: Mode | null | undefined;
    resetQuestion: () => void;
    onReset: () => void;
    onCreate: (question: Question) => Promise<Question>;
    onSave: (question: Question) => Promise<void>;
  } & {
    isCardIdError: boolean;
    originalId: SdkQuestionId | null;
  };
