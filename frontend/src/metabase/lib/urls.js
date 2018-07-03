import { serializeCardForUrl } from "metabase/lib/card";
import MetabaseSettings from "metabase/lib/settings";
import Question from "metabase-lib/lib/Question";

// provides functions for building urls to things we care about

export const activity = "/activity";

export const newQuestion = () => "/question/new";

export const newDashboard = collectionId =>
  `collection/${collectionId}/new_dashboard`;

export const newPulse = collectionId =>
  `/pulse/create?collectionId=${collectionId}`;

export const newCollection = collectionId =>
  `collection/${collectionId}/new_collection`;

export function question(cardId, hash = "", query = "") {
  if (hash && typeof hash === "object") {
    hash = serializeCardForUrl(hash);
  }
  if (query && typeof query === "object") {
    query = Object.entries(query)
      .map(kv => {
        if (Array.isArray(kv[1])) {
          return kv[1]
            .map(v => `${encodeURIComponent(kv[0])}=${encodeURIComponent(v)}`)
            .join("&");
        } else {
          return kv.map(encodeURIComponent).join("=");
        }
      })
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

export function plainQuestion() {
  return Question.create({ metadata: null }).getUrl();
}

export function dashboard(dashboardId, { addCardWithId } = {}) {
  return addCardWithId != null
    ? `/dashboard/${dashboardId}#add=${addCardWithId}`
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
  return `/pulse/#${pulseId}`;
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

export function label(label) {
  return `/questions/search?label=${encodeURIComponent(label.slug)}`;
}

export function publicQuestion(uuid, type = null) {
  const siteUrl = MetabaseSettings.get("site_url");
  return `${siteUrl}/public/question/${uuid}` + (type ? `.${type}` : ``);
}

export function publicDashboard(uuid) {
  const siteUrl = MetabaseSettings.get("site_url");
  return `${siteUrl}/public/dashboard/${uuid}`;
}

export function embedCard(token, type = null) {
  return `/embed/question/${token}` + (type ? `.${type}` : ``);
}

export function embedDashboard(token) {
  return `/embed/dashboard/${token}`;
}

export function userCollection(userCollectionId) {
  return `/collection/${userCollectionId}/`;
}

export function accountSettings() {
  return `/user/edit_current`;
}
