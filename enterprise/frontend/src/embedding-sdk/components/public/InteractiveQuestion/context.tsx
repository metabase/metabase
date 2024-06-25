import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useUnmount } from "react-use";

import type { SdkPluginsConfig } from "embedding-sdk";
import { getDefaultVizHeight } from "embedding-sdk/lib/default-height";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { initializeQBRaw, resetQB } from "metabase/query_builder/actions";
import {
  getCard,
  getFirstQueryResult,
  getQueryResults,
  getQuestion,
  getUiControls,
} from "metabase/query_builder/selectors";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type Question from "metabase-lib/v1/Question";
import type { Card, Dataset } from "metabase-types/api";
import type { QueryBuilderUIControls } from "metabase-types/store";

type InteractiveQuestionContextType = {
  question: Question;
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
};

export const InteractiveQuestionContext = createContext<
  InteractiveQuestionContextType | undefined
>(undefined);

const returnNull = () => null;

export const InteractiveQuestionProvider = ({
  children,
  location,
  params,
  componentPlugins,
  onReset,
  onNavigateBack,
  withTitle = false,
  customTitle,
  withResetButton,
}: PropsWithChildren<{
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
  customTitle?: React.ReactNode;
}>) => {
  const dispatch = useDispatch();

  const globalPlugins = useSdkSelector(getPlugins);
  const question = useSelector(getQuestion);
  const card = useSelector(getCard);
  const result = useSelector(getFirstQueryResult);
  const uiControls = useSelector(getUiControls);
  const queryResults = useSelector(getQueryResults);

  const hasQuestionChanges =
    card && (!card.id || card.id !== card.original_card_id);

  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  const loadQuestion = useCallback(async () => {
    setIsQuestionLoading(true);

    try {
      await dispatch(initializeQBRaw(location, params));
    } catch (e) {
      console.error(`Failed to get question`, e);
      setIsQuestionLoading(false);
    }
  }, [dispatch, location, params]);

  useEffect(() => {
    loadQuestion();
  }, [loadQuestion]);

  useEffect(() => {
    if (queryResults) {
      setIsQuestionLoading(false);
    }
  }, [queryResults]);

  const resetQuestion = () => {
    loadQuestion();
  };

  const { isRunning: isQueryRunning } = uiControls;

  useUnmount(() => {
    dispatch(resetQB());
  });

  const defaultHeight = card ? getDefaultVizHeight(card.display) : undefined;

  const plugins = componentPlugins || globalPlugins;
  const mode = question && getEmbeddingMode(question, plugins || undefined);

  if (question) {
    question.alertType = returnNull; // FIXME: this removes "You can also get an alert when there are some results." feature for question
  }

  return (
    <InteractiveQuestionContext.Provider
      value={{
        question,
        card,
        result,
        uiControls,
        queryResults,
        plugins,
        mode,
        defaultHeight,
        isQuestionLoading,
        isQueryRunning,
        resetQuestion,
        onReset: onReset || resetQuestion,
        onNavigateBack: onNavigateBack || resetQuestion,
        withTitle,
        customTitle,
        withResetButton: hasQuestionChanges && withResetButton,
      }}
    >
      {children}
    </InteractiveQuestionContext.Provider>
  );
};

export const useInteractiveQuestionContext = () => {
  const context = useContext(InteractiveQuestionContext);
  if (context === undefined) {
    throw new Error(
      "useInteractiveQuestionContext must be used within a InteractiveQuestionProvider",
    );
  }
  return context;
};
