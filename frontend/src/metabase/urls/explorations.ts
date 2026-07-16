import type { DocumentId, ExplorationId } from "metabase-types/api";

export const EXPLORATION_BASE_PATH = "question/research";

export function newExploration(): string {
  return `/${EXPLORATION_BASE_PATH}`;
}

export function newExplorationPlan(): string {
  return `/${EXPLORATION_BASE_PATH}/plan`;
}

export function exploration(explorationId: ExplorationId): string {
  return `/${EXPLORATION_BASE_PATH}/${explorationId}`;
}

export function explorationDocument(
  explorationId: ExplorationId,
  documentId: DocumentId,
): string {
  return `/${EXPLORATION_BASE_PATH}/${explorationId}/document/${documentId}`;
}

export function explorationDocumentComments(
  explorationId: ExplorationId,
  documentId: DocumentId,
): string {
  return explorationDocument(explorationId, documentId) + "/comments/all";
}
