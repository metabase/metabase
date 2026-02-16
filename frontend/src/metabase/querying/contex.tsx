import { type PropsWithChildren, createContext } from "react";

import {
  DEFAULT_EMBEDDING_DATA_PICKER_STATE,
  normalizeEntityTypes,
} from "metabase/redux/embedding-data-picker";
import type {
  EmbeddingDataPicker,
  EmbeddingEntityType,
} from "metabase-types/store/embedding-data-picker";

interface QueryingContext {
  entityTypes: EmbeddingEntityType[];
  dataPicker: EmbeddingDataPicker;
}

/**
 * In full-app embedding, parameters are passed via the URL and stored in Redux. In modular embeddings,
 * parameters are passed directly via props and to the SDK context. However, we cannot access SDK context
 * in the OSS codebase, so we need to create an OSS context to receive these props from modular embeddings.
 *
 * We won't provide a function like `useQueryingContext` similar to `useDashboardContext` where
 * we throw an error if the caller calls the function outside of the context provider, because
 * I cannot pinpoint all the entry points where we should put the context, as querying is used in many places,
 * unlike what we did for dashboards. Instead, we use the context and if the values are absent,
 * we fall back to the values from Redux.
 *
 * Currently, this context is only used in the embedding data picker.
 */
export const QueryingContext = createContext<QueryingContext | undefined>(
  undefined,
);

export function QueryingContextProvider({
  entityTypes = DEFAULT_EMBEDDING_DATA_PICKER_STATE.entityTypes,
  dataPicker = DEFAULT_EMBEDDING_DATA_PICKER_STATE.dataPicker,
  children,
}: PropsWithChildren<Partial<QueryingContext>>) {
  return (
    <QueryingContext.Provider
      value={{ entityTypes: normalizeEntityTypes(entityTypes), dataPicker }}
    >
      {children}
    </QueryingContext.Provider>
  );
}
