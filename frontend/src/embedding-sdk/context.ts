import { createContext, useContext } from "react";

interface EmbeddingSdkContextData {
  isInitialized: boolean;
  isLoggedIn: boolean;
  font: string | null;
  setFont: (font: string) => void;
}

export const EmbeddingContext = createContext<EmbeddingSdkContextData>({
  isInitialized: false,
  isLoggedIn: false,
  font: null,
  setFont: () => {},
});

export const useEmbeddingContext = () => {
  return useContext(EmbeddingContext);
};
