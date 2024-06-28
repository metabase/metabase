import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  useMemo,
} from "react";
import { useUnmount } from "react-use";

import type { SdkPluginsConfig } from "embedding-sdk";
import { getDefaultVizHeight } from "embedding-sdk/lib/default-height";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  initializeQBRaw,
  resetQB,
  updateQuestion,
} from "metabase/query_builder/actions";
import {
  getCard,
  getFirstQueryResult,
  getQueryResults,
  getQuestion,
  getUiControls,
} from "metabase/query_builder/selectors";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type * as Lib from "metabase-lib";

type InteractiveQuestionContextType = {
  plugins: SdkPluginsConfig | null;
  mode: Mode | null | undefined;
  isQuestionLoading: boolean;
  resetQuestion: () => void;
  onReset?: () => void;
  onNavigateBack?: () => void;
  withTitle?: boolean;
  customTitle?: React.ReactNode;
  withResetButton?: boolean;
};

/**
 * Note: This context should only be used as a wrapper for the InteractiveQuestionResult
 * component. The idea behind this context is to allow the InteractiveQuestionResult component
 * to use components within the ./components folder, which use the context for display
 * and functions. Any data that can be referenced from the store should be placed in
 * the useInteractiveQuestionData hook.
 * */
export const InteractiveQuestionContext = createContext<
  InteractiveQuestionContextType | undefined
>(undefined);

const returnNull = () => null;

export const useInteractiveQuestionData = () => {
  const dispatch = useDispatch();

  const question = useSelector(getQuestion);
  const card = useSelector(getCard);
  const result = useSelector(getFirstQueryResult);
  const uiControls = useSelector(getUiControls);
  const queryResults = useSelector(getQueryResults);

  const defaultHeight = card ? getDefaultVizHeight(card.display) : undefined;

  const { isRunning: isQueryRunning } = uiControls;

  const hasQuestionChanges =
    card && (!card.id || card.id !== card.original_card_id);

  if (question) {
    question.alertType = returnNull; // FIXME: this removes "You can also get an alert when there are some results." feature for question
  }

  const onQueryChange = async (query: Lib.Query) => {
    if (question) {
      const nextQuestion = question.setQuery(query);
      await dispatch(updateQuestion(nextQuestion, { run: true }));
    }
  };

  return {
    question,
    card,
    result,
    uiControls,
    queryResults,
    isQueryRunning,
    hasQuestionChanges,
    defaultHeight,
    onQueryChange,
  };
};

type UseLoadQuestionParams = {
  location: {
    search?: string;
    hash?: string;
    pathname?: string;
    query?: Record<string, unknown>;
  };
  params: {
    slug?: string;
  };
};

const useLoadQuestion = ({ location, params }: UseLoadQuestionParams) => {
  const dispatch = useDispatch();

  const queryResults = useSelector(getQueryResults);

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

  useUnmount(() => {
    dispatch(resetQB());
  });
  return { resetQuestion, isQuestionLoading };
};

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
}: PropsWithChildren<
  UseLoadQuestionParams & {
    componentPlugins?: SdkPluginsConfig;
    withResetButton?: boolean;
    onReset?: () => void;
    onNavigateBack?: () => void;
    withTitle?: boolean;
    customTitle?: ReactNode;
  }
>) => {
  const { isQuestionLoading, resetQuestion } = useLoadQuestion({
    location: location,
    params: params,
  });

  const { question } = useInteractiveQuestionData();

  const globalPlugins = useSdkSelector(getPlugins);
  const plugins = componentPlugins || globalPlugins;
  const mode = useMemo(
    () => question && getEmbeddingMode(question, plugins || undefined),
    [plugins, question],
  );

  return (
    <InteractiveQuestionContext.Provider
      value={{
        isQuestionLoading,
        resetQuestion,
        onReset: onReset || resetQuestion,
        onNavigateBack,
        withTitle,
        customTitle,
        withResetButton,
        mode,
        plugins,
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
