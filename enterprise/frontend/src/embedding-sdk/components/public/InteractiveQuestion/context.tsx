import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import type { SdkPluginsConfig } from "embedding-sdk";
import {
  loadSdkQuestion,
  type LoadSdkQuestionParams,
} from "embedding-sdk/lib/load-question";
import {
  runQuestionOnQueryChangeSdk,
  runQuestionOnNavigateSdk,
} from "embedding-sdk/lib/run-question-query";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import type {
  NavigateToNewCardParams,
  SdkQuestionResult,
} from "embedding-sdk/types/question";
import { useDispatch } from "metabase/lib/redux";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type Question from "metabase-lib/v1/Question";

interface InteractiveQuestionContextType extends SdkQuestionResult {
  plugins: SdkPluginsConfig | null;
  mode: Mode | null | undefined;
  isQuestionLoading: boolean;
  resetQuestion: () => void;
  onReset?: () => void;
  onNavigateBack?: () => void;
  onQuestionChange: (question: Question) => void;
  onNavigateToNewCard: (params: NavigateToNewCardParams) => void;
}

/**
 * Note: This context should only be used as a wrapper for the InteractiveQuestionResult
 * component. The idea behind this context is to allow the InteractiveQuestionResult component
 * to use components within the ./components folder, which use the context for display
 * and functions.
 * */
export const InteractiveQuestionContext = createContext<
  InteractiveQuestionContextType | undefined
>(undefined);

type InteractiveQuestionProviderProps = PropsWithChildren<
  {
    componentPlugins?: SdkPluginsConfig;
    onReset?: () => void;
    onNavigateBack?: () => void;
  } & LoadSdkQuestionParams
>;

export const InteractiveQuestionProvider = ({
  location,
  params,
  componentPlugins,
  onReset,
  onNavigateBack,
  children,
}: InteractiveQuestionProviderProps) => {
  const dispatch = useDispatch();

  const [result, setQuestionResult] = useState<SdkQuestionResult>({});
  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  const { question, queryResults } = result;

  const globalPlugins = useSdkSelector(getPlugins);
  const plugins = componentPlugins || globalPlugins;

  const mode = question && getEmbeddingMode(question, plugins ?? undefined);

  const storeQuestionResult = async (
    getQuestionResult: () => Promise<SdkQuestionResult | null>,
  ) => {
    setIsQuestionLoading(true);

    try {
      const result = await getQuestionResult();

      if (result) {
        setQuestionResult(result);
      }
    } catch (e) {
      console.error(`Failed to update question result`, e);
    } finally {
      setIsQuestionLoading(false);
    }
  };

  const loadQuestion = useCallback(
    () =>
      storeQuestionResult(() =>
        dispatch(loadSdkQuestion({ location, params })),
      ),
    [dispatch, location, params],
  );

  const onQuestionChange = useCallback(
    async (nextQuestion: Question) =>
      storeQuestionResult(async () =>
        question
          ? dispatch(runQuestionOnQueryChangeSdk(question, nextQuestion))
          : null,
      ),
    [dispatch, question],
  );

  const onNavigateToNewCard = useCallback(
    async (params: NavigateToNewCardParams) =>
      storeQuestionResult(() => dispatch(runQuestionOnNavigateSdk(params))),
    [dispatch],
  );

  const questionContext: InteractiveQuestionContextType = {
    isQuestionLoading,
    resetQuestion: loadQuestion,
    onReset: onReset || loadQuestion,
    onNavigateBack,
    onQuestionChange,
    onNavigateToNewCard,
    mode,
    plugins,
    question,
    queryResults,
  };

  useEffect(() => {
    loadQuestion();
  }, [loadQuestion]);

  return (
    <InteractiveQuestionContext.Provider value={questionContext}>
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
