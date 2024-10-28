import type { PropsWithChildren } from "react";

import type { SdkPluginsConfig } from "embedding-sdk";
import type { LoadQuestionHookResult } from "embedding-sdk/hooks/private/use-load-question";
import type { LoadSdkQuestionParams } from "embedding-sdk/types/question";
import type { NotebookProps as QBNotebookProps } from "metabase/querying/notebook/components/Notebook";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import type Question from "metabase-lib/v1/Question";
import type { CardEntityId, CardId, CollectionId } from "metabase-types/api";

export type EntityTypeFilterKeys = "table" | "question" | "model" | "metric";

export type InteractiveQuestionConfig = {
  componentPlugins?: SdkPluginsConfig;
  onNavigateBack?: () => void;
  onBeforeSave?: (question?: Question) => Promise<void>;
  onSave?: (question?: Question) => void;
  entityTypeFilter?: EntityTypeFilterKeys[];
  saveOptions?: SdkInteractiveQuestionSaveOptions;
};

export type SdkInteractiveQuestionSaveOptions = {
  /** Is the save question button visible? */
  isEnabled?: boolean;

  /** Allow the user to choose the collection to save this question to? */
  withCollectionPicker?: boolean;

  /**
   * The collection to save the question to.
   *
   * If `withCollectionPicker` is true, this is the initial collection id..
   * Otherwise, this becomes the target collection to save to.
   **/
  collectionId?: CollectionId | null;
};

export type QuestionMockLocationParameters = {
  location: { search: string; hash: string; pathname: string };
  params: { slug?: string };
};

export type InteractiveQuestionProviderWithLocationProps = PropsWithChildren<
  InteractiveQuestionConfig & QuestionMockLocationParameters
>;

export type InteractiveQuestionProviderProps = PropsWithChildren<
  InteractiveQuestionConfig &
    Omit<LoadSdkQuestionParams, "cardId"> & { cardId?: CardId | CardEntityId }
>;

export type InteractiveQuestionContextType = Omit<
  LoadQuestionHookResult,
  "loadQuestion"
> &
  Pick<InteractiveQuestionConfig, "onNavigateBack" | "saveOptions"> &
  Pick<QBNotebookProps, "modelsFilterList"> & {
    plugins: InteractiveQuestionConfig["componentPlugins"] | null;
    mode: Mode | null | undefined;
    resetQuestion: () => void;
    onReset: () => void;
    onCreate: (question: Question) => Promise<void>;
    onSave: (question: Question) => Promise<void>;
  };
