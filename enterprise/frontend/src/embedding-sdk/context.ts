import { createContext, useContext } from "react";

import { DEFAULT_FONT } from "embedding-sdk/config";

interface EmbeddingSdkContextData {
  isInitialized: boolean;
  isLoggedIn: boolean;
  font: string;
  setFont: (font: string) => void;
}

export const EmbeddingContext = createContext<EmbeddingSdkContextData>({
  isInitialized: false,
  isLoggedIn: false,
  font: DEFAULT_FONT,
  setFont: () => {},
});

export const useEmbeddingContext = () => {
  return useContext(EmbeddingContext);
};
