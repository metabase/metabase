import { skipToken, useGetDocumentQuery } from "metabase/api";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Document } from "metabase-types/api";

type RouteDocumentResult = {
  /** `undefined` while loading, and when the route names no document */
  document: Document | undefined;
  isLoading: boolean;
  error: unknown;
};

export function useRouteDocument(): RouteDocumentResult {
  const params = useParams<{ documentId: string }>();
  const documentId = Urls.extractEntityId(params.documentId);
  const {
    currentData: document,
    isFetching,
    error,
  } = useGetDocumentQuery(documentId != null ? { id: documentId } : skipToken);

  return {
    document,
    isLoading: document === undefined && isFetching,
    error,
  };
}
