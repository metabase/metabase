import { createContext } from "react";

interface EmbeddingSdkContextData {
  apiUrl: string;
  isInitialized: boolean;
  isLoggedIn: boolean;
  font: string | null;
  setFont: (font: string) => void;
}

export const EmbeddingContext = createContext<EmbeddingSdkContextData>({
  apiUrl: "",
  isInitialized: false,
  isLoggedIn: false,
  font: null,
  setFont: () => {},
});
