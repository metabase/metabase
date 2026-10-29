import type { CardId, WritebackActionId } from "metabase-types/api";

/**
 * Canonical data-app URLs. `DATA_APP_URL_SEGMENT` is the single source of
 * truth for the `apps` path segment; the page, admin, and iframe-embed URLs
 * all derive from it, so renaming the route is a one-line change here.
 */
export const DATA_APP_URL_SEGMENT = "apps";

/** User-facing page route: `/apps/:name`. */
export const DATA_APP_ROOT_URL = `/${DATA_APP_URL_SEGMENT}`;

/**
 * Prefix the BE serves the internal data-app iframe entrypoint at:
 * `/embed/apps`. The host builds the iframe `src` and mirrors its URL from
 * this; the SDK bundle's router reads it to auto-detect its basename.
 */
export const DATA_APP_EMBED_PREFIX = `/embed/${DATA_APP_URL_SEGMENT}`;

/**
 * Same-origin document Near-Membrane loads as the sandbox realm iframe. It carries
 * its own CSP granting `'unsafe-eval'`, which is what lets the data-app document
 * itself drop that grant.
 */
export const DATA_APP_REALM_HOST_URL = "/api/ee/apps/sandbox-host";

export function dataApp(name: string) {
  return `${DATA_APP_ROOT_URL}/${encodeURIComponent(name)}`;
}

export function dataStudioDataApps() {
  return `/data-studio/${DATA_APP_URL_SEGMENT}`;
}

export function dataStudioDataApp(name: string) {
  return `${dataStudioDataApps()}/${encodeURIComponent(name)}`;
}

export function dataStudioDataAppQuestions(name: string) {
  return `${dataStudioDataApp(name)}/questions`;
}

export function dataStudioDataAppActions(name: string) {
  return `${dataStudioDataApp(name)}/actions`;
}

export function dataStudioDataAppQuestion(name: string, cardId: CardId) {
  return `${dataStudioDataAppQuestions(name)}/${cardId}`;
}

export function dataStudioDataAppQuestionDependencies(
  name: string,
  cardId: CardId,
) {
  return `${dataStudioDataAppQuestion(name, cardId)}/dependencies`;
}

export function dataStudioDataAppPermissions(name: string) {
  return `${dataStudioDataApp(name)}/permissions`;
}

export function dataStudioDataAppAction(
  name: string,
  actionId: WritebackActionId,
) {
  return `${dataStudioDataAppActions(name)}/${actionId}`;
}

export function dataStudioDataAppActionFields(
  name: string,
  actionId: WritebackActionId,
  fieldId?: string,
) {
  const fieldsUrl = `${dataStudioDataAppAction(name, actionId)}/fields`;
  return fieldId != null
    ? `${fieldsUrl}/${encodeURIComponent(fieldId)}`
    : fieldsUrl;
}

export function dataStudioDataAppActionDependencies(
  name: string,
  actionId: WritebackActionId,
) {
  return `${dataStudioDataAppAction(name, actionId)}/dependencies`;
}
