import { useContext } from "react";

import { EmbeddingContext } from "../../context";

export const useEmbeddingContext = () => {
  return useContext(EmbeddingContext);
};
