import type { CardId, WritebackActionId } from "metabase-types/api";

/**
 * Canonical data-app URLs. `DATA_APP_URL_SEGMENT` is the single source of
 * truth for the `apps` path segment; the page, admin, and iframe-embed URLs
 * all derive from it, so renaming the route is a one-line change here.
 */
export const DATA_APP_URL_SEGMENT = "apps";

/** User-facing page route: `/apps/:slug`. */
export const DATA_APP_ROOT_URL = `/${DATA_APP_URL_SEGMENT}`;

/**
 * Prefix the BE serves the internal data-app iframe entrypoint at:
 * `/embed/apps`. The host builds the iframe `src` and mirrors its URL from
 * this; the SDK bundle's router reads it to auto-detect its basename.
 */
export const DATA_APP_EMBED_PREFIX = `/embed/${DATA_APP_URL_SEGMENT}`;

export function dataApp(slug: string) {
  return `${DATA_APP_ROOT_URL}/${encodeURIComponent(slug)}`;
}

export function dataStudioDataApps() {
  return `/data-studio/${DATA_APP_URL_SEGMENT}`;
}

export function dataStudioDataApp(slug: string) {
  return `${dataStudioDataApps()}/${encodeURIComponent(slug)}`;
}

export function dataStudioDataAppQuestions(slug: string) {
  return `${dataStudioDataApp(slug)}/questions`;
}

export function dataStudioDataAppActions(slug: string) {
  return `${dataStudioDataApp(slug)}/actions`;
}

export function dataStudioDataAppQuestion(slug: string, cardId: CardId) {
  return `${dataStudioDataAppQuestions(slug)}/${cardId}`;
}

export function dataStudioDataAppQuestionDependencies(
  slug: string,
  cardId: CardId,
) {
  return `${dataStudioDataAppQuestion(slug, cardId)}/dependencies`;
}

export function dataStudioDataAppPermissions(slug: string) {
  return `${dataStudioDataApp(slug)}/permissions`;
}

export function dataStudioDataAppAction(
  slug: string,
  actionId: WritebackActionId,
) {
  return `${dataStudioDataAppActions(slug)}/${actionId}`;
}

export function dataStudioDataAppActionFields(
  slug: string,
  actionId: WritebackActionId,
  fieldId?: string,
) {
  const fieldsUrl = `${dataStudioDataAppAction(slug, actionId)}/fields`;
  return fieldId != null
    ? `${fieldsUrl}/${encodeURIComponent(fieldId)}`
    : fieldsUrl;
}

export function dataStudioDataAppActionDependencies(
  slug: string,
  actionId: WritebackActionId,
) {
  return `${dataStudioDataAppAction(slug, actionId)}/dependencies`;
}
