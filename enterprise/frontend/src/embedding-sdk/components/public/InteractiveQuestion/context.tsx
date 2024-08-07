import {
  createContext,
  useContext,
  useEffect,
  type PropsWithChildren,
  useMemo,
} from "react";

import type { SdkPluginsConfig } from "embedding-sdk";
import {
  useLoadQuestion,
  type LoadQuestionHookResult,
} from "embedding-sdk/hooks/private/use-load-question";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import type { LoadSdkQuestionParams } from "embedding-sdk/types/question";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import {
  deserializeCard,
  parseHash,
  QueryParams,
} from "metabase/query_builder/actions";
import { LocationDescriptorObject } from "history";
import * as Urls from "metabase/lib/urls";
import { CardId, Card } from "metabase-types/api";

interface InteractiveQuestionContextType
  extends Omit<LoadQuestionHookResult, "loadQuestion"> {
  plugins: SdkPluginsConfig | null;
  mode: Mode | null | undefined;
  resetQuestion: () => void;
  onReset?: () => void;
  onNavigateBack?: () => void;
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

type InteractiveQuestionProviderProps = PropsWithChildren<{
  componentPlugins?: SdkPluginsConfig;
  onReset?: () => void;
  onNavigateBack?: () => void;
}>;

// allow a provider with location + params
export const InteractiveQuestionProviderWithLocation = ({
  location,
  params,
  ...providerProps
}: InteractiveQuestionProviderProps & {
  location: LocationDescriptorObject;
  params: QueryParams;
}) => {
  const cardId = Urls.extractEntityId(params.slug);
  const { options, serializedCard } = parseHash(location.hash);
  const deserializedCard = serializedCard
    ? deserializeCard(serializedCard)
    : undefined;

  console.log("InteractiveQuestionProvider - ", cardId, deserializedCard?.id);

  return (
    <InteractiveQuestionProvider
      {...providerProps}
      cardId={cardId}
      options={options}
      deserializedCard={deserializedCard}
    />
  );
};

export const InteractiveQuestionProvider = ({
  cardId,
  options,
  deserializedCard,
  componentPlugins,
  onReset,
  onNavigateBack,
  children,
}: InteractiveQuestionProviderProps & {
  cardId?: CardId;
  options: QueryParams;
  deserializedCard?: Card;
}) => {
  const {
    question,
    queryResults,

    isQuestionLoading,
    isQueryRunning,

    loadQuestion,
    onQuestionChange,
    onNavigateToNewCard,
  } = useLoadQuestion({
    cardId,
    options,
    deserializedCard,
  });

  const globalPlugins = useSdkSelector(getPlugins);
  const plugins = componentPlugins || globalPlugins;

  const mode = useMemo(() => {
    return question && getEmbeddingMode(question, plugins ?? undefined);
  }, [question, plugins]);

  const questionContext: InteractiveQuestionContextType = {
    isQuestionLoading,
    isQueryRunning,
    resetQuestion: loadQuestion,
    onReset: onReset || loadQuestion,
    onNavigateBack,
    onQuestionChange,
    onNavigateToNewCard,
    plugins,
    question,
    queryResults,
    mode,
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
