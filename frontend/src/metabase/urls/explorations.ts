import type { DocumentId, ExplorationId } from "metabase-types/api";

export function newExploration(): string {
  return "/explorations";
}

export function exploration(explorationId: ExplorationId): string {
  return `/explorations/${explorationId}`;
}

export function explorationDocument(
  explorationId: ExplorationId,
  documentId: DocumentId,
): string {
  return `/explorations/${explorationId}/document/${documentId}`;
}

export function explorationDocumentComments(
  explorationId: ExplorationId,
  documentId: DocumentId,
): string {
  return explorationDocument(explorationId, documentId) + "/comments/all";
}
