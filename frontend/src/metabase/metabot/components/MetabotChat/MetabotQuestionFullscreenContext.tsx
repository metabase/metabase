import { createContext, useContext } from "react";

export type FullscreenQuestion = {
  path: string;
  title: string;
};

type MetabotQuestionFullscreenContextValue = {
  fullscreenQuestion: FullscreenQuestion | null;
  openFullscreenQuestion: (question: FullscreenQuestion) => void;
  closeFullscreenQuestion: () => void;
};

export const MetabotQuestionFullscreenContext =
  createContext<MetabotQuestionFullscreenContextValue>({
    fullscreenQuestion: null,
    openFullscreenQuestion: () => {},
    closeFullscreenQuestion: () => {},
  });

export const useMetabotQuestionFullscreen = () =>
  useContext(MetabotQuestionFullscreenContext);
