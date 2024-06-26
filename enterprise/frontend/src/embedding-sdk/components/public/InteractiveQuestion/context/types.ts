import type { PropsWithChildren, ReactNode } from "react";

import type { SdkPluginsConfig } from "embedding-sdk";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import type * as MBLib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Card, Dataset } from "metabase-types/api";
import type { QueryBuilderUIControls } from "metabase-types/store";

export type InteractiveQuestionContextType = {
  question: Question | undefined;
  card: Card | null;
  result: Dataset | null;
  uiControls: QueryBuilderUIControls;
  queryResults: Dataset[] | null;
  plugins: SdkPluginsConfig | null;
  mode: Mode | null | undefined;
  defaultHeight?: number;
  isQuestionLoading: boolean;
  isQueryRunning: boolean;
  resetQuestion: () => void;
  onReset?: () => void;
  onNavigateBack?: () => void;
  withTitle?: boolean;
  customTitle?: React.ReactNode;
  withResetButton?: boolean;
  onQueryChange: (query: MBLib.Query) => Promise<void>;
  isFilterOpen: boolean;
  setIsFilterOpen: (value: boolean) => void;
  isSummarizeOpen: boolean;
  setIsSummarizeOpen: (value: boolean) => void;
  isNotebookOpen: boolean;
  setIsNotebookOpen: (value: boolean) => void;
};

export type InteractiveQuestionProviderProps = PropsWithChildren<{
  location: {
    search?: string;
    hash?: string;
    pathname?: string;
    query?: Record<string, unknown>;
  };
  params: {
    slug?: string;
  };
  componentPlugins?: SdkPluginsConfig;
  withResetButton?: boolean;
  onReset?: () => void;
  onNavigateBack?: () => void;

  withTitle?: boolean;
  customTitle?: ReactNode;

  isControlled?: boolean;
}>;
