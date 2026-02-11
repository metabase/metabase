import { createContext, useContext } from "react";

import type { TransformId } from "metabase-types/api";

type TransformInspectContextType = {
  transformId: TransformId;
};

export const TransformInspectContext =
  createContext<TransformInspectContextType | null>(null);

export const useTransformInspectContext = () => {
  const ctx = useContext(TransformInspectContext);
  if (!ctx) {
    throw new Error(
      "useTransformInspectContext must be used within a TransformInspectContext.Provider",
    );
  }
  return ctx;
};
