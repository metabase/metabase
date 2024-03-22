import { createContext, useContext } from "react";

interface EmbeddingSdkContextData {
  isInitialized: boolean;
  isLoggedIn: boolean;
}

export const EmbeddingContext = createContext<EmbeddingSdkContextData>({
  isInitialized: false,
  isLoggedIn: false,
});

export const useEmbeddingContext = () => {
  return useContext(EmbeddingContext);
};
