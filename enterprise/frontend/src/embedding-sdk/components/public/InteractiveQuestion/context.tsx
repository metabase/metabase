import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
} from "react";

import type { SdkPluginsConfig } from "embedding-sdk";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";

import {
  type UseLoadQuestionParams,
  useInteractiveQuestionData,
  useLoadQuestion,
} from "./hooks";

type InteractiveQuestionContextType = {
  plugins: SdkPluginsConfig | null;
  mode: Mode | null | undefined;
  isQuestionLoading: boolean;
  resetQuestion: () => void;
  onReset?: () => void;
  onNavigateBack?: () => void;
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

type InteractiveQuestionProviderProps = PropsWithChildren<
  UseLoadQuestionParams & {
    componentPlugins?: SdkPluginsConfig;
    onReset?: () => void;
    onNavigateBack?: () => void;
  }
>;

export const InteractiveQuestionProvider = ({
  children,
  location,
  params,
  componentPlugins,
  onReset,
  onNavigateBack,
}: InteractiveQuestionProviderProps) => {
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
