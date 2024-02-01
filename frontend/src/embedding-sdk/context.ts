import { createContext } from "react";

interface EmbeddingSdkContextData {
  apiUrl: string;
  apiKey: string;
  isInitialized: boolean;
  isLoggedIn: boolean;
}

export const EmbeddingContext = createContext<EmbeddingSdkContextData>({
  apiUrl: "",
  apiKey: "",
  isInitialized: false,
  isLoggedIn: false,
});
