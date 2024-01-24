import { createContext } from "react";

interface EmbeddingSdkContextData {
  apiUrl: string;
  secretKey: string;
}

export const EmbeddingContext = createContext<EmbeddingSdkContextData | null>(
  null,
);
