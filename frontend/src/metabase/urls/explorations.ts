import type { DocumentId, ExplorationId } from "metabase-types/api";

export function newExploration(): string {
  return "/question/research";
}

export function exploration(explorationId: ExplorationId): string {
  return `/question/research/${explorationId}`;
}

export function explorationDocument(
  explorationId: ExplorationId,
  documentId: DocumentId,
): string {
  return `/question/research/${explorationId}/document/${documentId}`;
}

export function explorationDocumentComments(
  explorationId: ExplorationId,
  documentId: DocumentId,
): string {
  return explorationDocument(explorationId, documentId) + "/comments/all";
}
