import { createContext, useContext } from "react";

interface QuestionRunState {
  isRunning: boolean;
  hasBeenRun: boolean;
  lastRunAt?: string;
}

interface QuestionRunStateContextType {
  questionRunStates: Record<number, QuestionRunState>;
}

export const QuestionRunStateContext = createContext<QuestionRunStateContextType>({
  questionRunStates: {},
});

export const useQuestionRunState = () => {
  return useContext(QuestionRunStateContext);
};

export const QuestionRunStateProvider = QuestionRunStateContext.Provider;
