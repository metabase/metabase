import { createContext } from "react";

interface EmbeddingSdkContextData {
  apiUrl: string;
  isInitialized: boolean;
  isLoggedIn: boolean;
}

export const EmbeddingContext = createContext<EmbeddingSdkContextData>({
  apiUrl: "",
  isInitialized: false,
  isLoggedIn: false,
});
