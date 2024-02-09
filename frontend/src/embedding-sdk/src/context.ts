import { createContext } from "react";

interface EmbeddingSdkContextData {
  apiUrl: string;
  isInitialized: boolean;
  isLoggedIn: boolean;
  sessionToken: string | null;
  tokenExp: string | null;
}

export const EmbeddingContext = createContext<EmbeddingSdkContextData>({
  apiUrl: "",
  isInitialized: false,
  isLoggedIn: false,
  sessionToken: null,
  tokenExp: null,
});
