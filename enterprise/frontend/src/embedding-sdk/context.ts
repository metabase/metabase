import { createContext, useContext } from "react";
import type { LoginStatus } from "embedding-sdk/types";

interface EmbeddingSdkContextData {
  isLoggedIn: boolean;
  loginStatus: LoginStatus;
}

export const EmbeddingContext = createContext<EmbeddingSdkContextData>({
  isLoggedIn: false,
  loginStatus: null,
});

export const useEmbeddingContext = () => {
  return useContext(EmbeddingContext);
};
