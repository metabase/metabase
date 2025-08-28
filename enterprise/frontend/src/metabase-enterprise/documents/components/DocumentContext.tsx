import type React from "react";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { Comment } from "metabase-types/api";

export interface DocumentContextValue {
  comments: Comment[] | undefined;
}

const DocumentContext = createContext<DocumentContextValue | undefined>(
  undefined,
);

export interface DocumentProviderProps {
  children: ReactNode;
  value: DocumentContextValue;
}

export const DocumentProvider: React.FC<DocumentProviderProps> = ({
  children,
  value,
}) => {
  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
};

export const useDocumentContext = (): DocumentContextValue => {
  const context = useContext(DocumentContext);

  if (context === undefined) {
    throw new Error(
      "useDocumentContext must be used within an DocumentProvider",
    );
  }

  return context;
};
