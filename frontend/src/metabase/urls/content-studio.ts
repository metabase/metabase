import slugg from "slugg";

import type {
  Card,
  CardId,
  Collection,
  CollectionId,
  NativeQuerySnippetId,
  RemoteSyncWorktreeId,
  TransformId,
} from "metabase-types/api";

import { extractCollectionId } from "./collections";
import { appendSlug } from "./utils";

const ROOT_URL = "/content-studio";

export const CONTENT_STUDIO_WORKTREE_PARAM = "worktree";

/**
 * Which branch the studio is scoped to. Absence of a worktree means the main
 * scope; landing routes carry it in the URL so they stay shareable.
 */
export type ContentStudioScopeParams = {
  worktreeId?: RemoteSyncWorktreeId;
};

function withScope(path: string, { worktreeId }: ContentStudioScopeParams) {
  return worktreeId != null
    ? `${path}?${CONTENT_STUDIO_WORKTREE_PARAM}=${worktreeId}`
    : path;
}

export function contentStudio() {
  return ROOT_URL;
}

export function contentStudioCollections(
  params: ContentStudioScopeParams = {},
) {
  return withScope(`${ROOT_URL}/collections`, params);
}

export function contentStudioCollection(
  collectionOrId: Pick<Collection, "id" | "name"> | CollectionId,
) {
  if (typeof collectionOrId === "object") {
    return appendSlug(
      `${ROOT_URL}/collection/${collectionOrId.id}`,
      slugg(collectionOrId.name),
    );
  }
  return `${ROOT_URL}/collection/${collectionOrId}`;
}

export function extractContentStudioCollectionIdFromPath(
  path: string,
): CollectionId | undefined {
  const match = path.match(/^\/content-studio\/collection\/([^/]+)/);
  return match ? extractCollectionId(match[1]) : undefined;
}

/** Questions, models and metrics all open on the same hosted page. */
export function contentStudioQuestion(
  cardOrId: Pick<Card, "id" | "name"> | CardId,
) {
  if (typeof cardOrId === "object") {
    return appendSlug(
      `${ROOT_URL}/question/${cardOrId.id}`,
      slugg(cardOrId.name),
    );
  }
  return `${ROOT_URL}/question/${cardOrId}`;
}

export function contentStudioTransforms(params: ContentStudioScopeParams = {}) {
  return withScope(`${ROOT_URL}/transforms`, params);
}

export function contentStudioNewQueryTransform(
  params: ContentStudioScopeParams = {},
) {
  return withScope(`${ROOT_URL}/transforms/new/query`, params);
}

export function contentStudioNewNativeTransform(
  params: ContentStudioScopeParams = {},
) {
  return withScope(`${ROOT_URL}/transforms/new/native`, params);
}

export function contentStudioNewTransformFromCard(
  cardId: CardId,
  params: ContentStudioScopeParams = {},
) {
  return withScope(`${ROOT_URL}/transforms/new/card/${cardId}`, params);
}

export function contentStudioTransform(transformId: TransformId) {
  return `${ROOT_URL}/transforms/${transformId}`;
}

export function contentStudioTransformEdit(transformId: TransformId) {
  return `${contentStudioTransform(transformId)}/edit`;
}

export function contentStudioTransformRun(transformId: TransformId) {
  return `${contentStudioTransform(transformId)}/run`;
}

export function contentStudioTransformSettings(transformId: TransformId) {
  return `${contentStudioTransform(transformId)}/settings`;
}

export function contentStudioTransformIndexes(transformId: TransformId) {
  return `${contentStudioTransform(transformId)}/indexes`;
}

export function contentStudioSnippets(params: ContentStudioScopeParams = {}) {
  return withScope(`${ROOT_URL}/snippets`, params);
}

export function contentStudioNewSnippet(params: ContentStudioScopeParams = {}) {
  return withScope(`${ROOT_URL}/snippets/new`, params);
}

export function contentStudioArchivedSnippets(
  params: ContentStudioScopeParams = {},
) {
  return withScope(`${ROOT_URL}/snippets/archived`, params);
}

export function contentStudioSnippet(snippetId: NativeQuerySnippetId) {
  return `${ROOT_URL}/snippets/${snippetId}`;
}
