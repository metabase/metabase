import { createContext } from "react";

interface EmbeddingSdkContextData {
  apiUrl: string;
  apiKey: string;
}

export const EmbeddingContext = createContext<EmbeddingSdkContextData>({
  apiUrl: "",
  apiKey: "",
});
