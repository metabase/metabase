import type { DocumentId, ExplorationId } from "metabase-types/api";

export function newExploration(): string {
  return "/explorations";
}

export function explorationDocument(
  explorationId: ExplorationId,
  documentId: DocumentId,
): string {
  return `/explorations/${explorationId}/document/${documentId}`;
}
