import { serializeCardForUrl } from "metabase/lib/card";
import MetabaseSettings from "metabase/lib/settings";
import Question from "metabase-lib/lib/Question";

// provides functions for building urls to things we care about

export const activity = "/activity";

export const exportFormats = ["csv", "xlsx", "json"];

export const newQuestionFlow = () => "/question/new";

export const newDashboard = collectionId =>
  `collection/${collectionId}/new_dashboard`;

export const newPulse = () => `/pulse/create`;

export const newCollection = collectionId =>
  `collection/${collectionId}/new_collection`;

export function question(cardId, hash = "", query = "") {
  if (hash && typeof hash === "object") {
    hash = serializeCardForUrl(hash);
  }
  if (query && typeof query === "object") {
    query = extractQueryParams(query)
      .map(kv => kv.map(encodeURIComponent).join("="))
      .join("&");
  }
  if (hash && hash.charAt(0) !== "#") {
    hash = "#" + hash;
  }
  if (query && query.charAt(0) !== "?") {
    query = "?" + query;
  }
  // NOTE that this is for an ephemeral card link, not an editable card
  return cardId != null
    ? `/question/${cardId}${query}${hash}`
    : `/question${query}${hash}`;
}

export const extractQueryParams = (query: Object): Array => {
  return [].concat(...Object.entries(query).map(flattenParam));
};

const flattenParam = ([key, value]) => {
  if (value instanceof Array) {
    return value.map(p => [key, p]);
  }

  return [[key, value]];
};

export function newQuestion({ mode, ...options } = {}) {
  const url = Question.create(options).getUrl();
  if (mode) {
    return url.replace(/^\/question/, `/question\/${mode}`);
  } else {
    return url;
  }
}

export function dashboard(dashboardId, { addCardWithId } = {}) {
  return addCardWithId != null
    ? // NOTE: no-color-literals rule thinks #add is a color, oops
      // eslint-disable-next-line no-color-literals
      `/dashboard/${dashboardId}#add=${addCardWithId}`
    : `/dashboard/${dashboardId}`;
}

export function modelToUrl(model, modelId) {
  switch (model) {
    case "card":
      return question(modelId);
    case "dashboard":
      return dashboard(modelId);
    case "pulse":
      return pulse(modelId);
    default:
      return null;
  }
}

export function pulse(pulseId) {
  return `/pulse/${pulseId}`;
}

export function pulseEdit(pulseId) {
  return `/pulse/${pulseId}`;
}

export function tableRowsQuery(databaseId, tableId, metricId, segmentId) {
  let query = `?db=${databaseId}&table=${tableId}`;

  if (metricId) {
    query += `&metric=${metricId}`;
  }

  if (segmentId) {
    query += `&segment=${segmentId}`;
  }

  return question(null, query);
}

export function collection(collectionId) {
  return `/collection/${collectionId || "root"}`;
}

export function collectionPermissions(collectionId) {
  return `/collection/${collectionId || "root"}/permissions`;
}

export function label(label) {
  return `/questions/search?label=${encodeURIComponent(label.slug)}`;
}

export function publicQuestion(uuid, type = null) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/public/question/${uuid}` + (type ? `.${type}` : ``);
}

export function publicDashboard(uuid) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/public/dashboard/${uuid}`;
}

export function embedCard(token, type = null) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/embed/question/${token}` + (type ? `.${type}` : ``);
}

export function embedDashboard(token) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/embed/dashboard/${token}`;
}

export function userCollection(userCollectionId) {
  return `/collection/${userCollectionId}/`;
}

export function accountSettings() {
  return `/user/edit_current`;
}

export function newUser() {
  return `/admin/people/new`;
}

export function editUser(userId) {
  return `/admin/people/${userId}/edit`;
}

export function resetPassword(userId) {
  return `/admin/people/${userId}/reset`;
}

export function newUserSuccess(userId) {
  return `/admin/people/${userId}/success`;
}

export function deactivateUser(userId) {
  return `/admin/people/${userId}/deactivate`;
}

export function reactivateUser(userId) {
  return `/admin/people/${userId}/reactivate`;
}

export function browseDatabase(database) {
  return `/browse/${database.id}`;
}

export function browseSchema(table) {
  return `/browse/${table.db.id}/schema/${table.schema_name}`;
}

export function browseTable(table) {
  return `/browse/${table.db.id}/schema/${table.schema_name}`;
}
