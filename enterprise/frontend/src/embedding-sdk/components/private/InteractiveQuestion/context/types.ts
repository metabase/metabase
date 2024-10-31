import type { PropsWithChildren } from "react";

import type { SdkPluginsConfig } from "embedding-sdk";
import type { LoadQuestionHookResult } from "embedding-sdk/hooks/private/use-load-question";
import type { LoadSdkQuestionParams } from "embedding-sdk/types/question";
import type { SaveQuestionProps } from "metabase/components/SaveQuestionForm/types";
import type { NotebookProps as QBNotebookProps } from "metabase/querying/notebook/components/Notebook";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import type Question from "metabase-lib/v1/Question";
import type { CardEntityId, CardId } from "metabase-types/api";

export type EntityTypeFilterKeys = "table" | "question" | "model" | "metric";

type InteractiveQuestionConfig = {
  componentPlugins?: SdkPluginsConfig;
  onNavigateBack?: () => void;
  onBeforeSave?: (question?: Question) => Promise<void>;
  onSave?: (question?: Question) => void;
  entityTypeFilter?: EntityTypeFilterKeys[];

  /** Is the save question button visible? */
  isSaveEnabled?: boolean;
} & Pick<SaveQuestionProps, "saveToCollectionId">;

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
  Pick<
    InteractiveQuestionConfig,
    "onNavigateBack" | "isSaveEnabled" | "saveToCollectionId"
  > &
  Pick<QBNotebookProps, "modelsFilterList"> & {
    plugins: InteractiveQuestionConfig["componentPlugins"] | null;
    mode: Mode | null | undefined;
    resetQuestion: () => void;
    onReset: () => void;
    onCreate: (question: Question) => Promise<void>;
    onSave: (question: Question) => Promise<void>;
  };
