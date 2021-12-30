import slugg from "slugg";
import { serializeCardForUrl } from "metabase/lib/card";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/saved-questions";
import MetabaseSettings from "metabase/lib/settings";
import Question from "metabase-lib/lib/Question";
import { stringifyHashOptions } from "metabase/lib/browser";

function appendSlug(path, slug) {
  return slug ? `${path}-${slug}` : path;
}

// provides functions for building urls to things we care about

export const activity = "/activity";

export const exportFormats = ["csv", "xlsx", "json"];

export const newQuestionFlow = () => "/question/new";

export const newDashboard = collectionId =>
  `collection/${collectionId}/new_dashboard`;

export const newPulse = () => `/pulse/create`;

export const newCollection = collectionId =>
  `collection/${collectionId}/new_collection`;

export function question(card, hash = "", query = "") {
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

  if (!card || !card.id) {
    return `/question${query}${hash}`;
  }

  const { card_id, id, name } = card;
  const basePath =
    card?.dataset || card?.model === "dataset" ? "dataset" : "question";

  /**
   * If the question has been added to the dashboard we're reading the dashCard's properties.
   * In that case `card_id` is the actual question's id, while `id` corresponds with the dashCard itself.
   *
   * There can be multiple instances of the same question in a dashboard, hence this distinction.
   */
  const questionId = card_id || id;

  /**
   * Although it's not possible to intentionally save a question without a name,
   * it is possible that the `name` is not recognized if it contains symbols.
   *
   * Please see: https://github.com/metabase/metabase/pull/15989#pullrequestreview-656646149
   */
  if (!name) {
    return `/${basePath}/${questionId}${query}${hash}`;
  }

  const path = appendSlug(`/${basePath}/${questionId}`, slugg(name));

  return `${path}${query}${hash}`;
}

export function serializedQuestion(card) {
  return question(null, card);
}

export const extractQueryParams = query => {
  return [].concat(...Object.entries(query).map(flattenParam));
};

const flattenParam = ([key, value]) => {
  if (value instanceof Array) {
    return value.map(p => [key, p]);
  }

  return [[key, value]];
};

export function newQuestion({ mode, creationType, ...options } = {}) {
  const url = Question.create(options).getUrl({ creationType });
  if (mode) {
    return url.replace(/^\/question/, `/question\/${mode}`);
  } else {
    return url;
  }
}

export function dataset(...args) {
  return question(...args);
}

export function dashboard(dashboard, { addCardWithId, editMode } = {}) {
  const options = {
    ...(addCardWithId ? { add: addCardWithId } : {}),
    ...(editMode ? { edit: editMode } : {}),
  };

  const path = appendSlug(dashboard.id, slugg(dashboard.name));
  const hash = stringifyHashOptions(options);
  return hash ? `/dashboard/${path}#${hash}` : `/dashboard/${path}`;
}

function prepareModel(item) {
  if (item.model_object) {
    return item.model_object;
  }
  return {
    id: item.model_id,
    ...item.details,
  };
}

export function modelToUrl(item) {
  const modelData = prepareModel(item);

  switch (item.model) {
    case "card":
      return question(modelData);
    case "dataset":
      return dataset(modelData);
    case "dashboard":
      return dashboard(modelData);
    case "pulse":
      return pulse(modelData.id);
    case "table":
      return tableRowsQuery(modelData.db_id, modelData.id);
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

function slugifyPersonalCollection(collection) {
  // Current user's personal collection name is replaced with "Your personal collection"
  // `originalName` keeps the original name like "John Doe's Personal Collection"
  const name = collection.originalName || collection.name;

  // Will keep single quote characters,
  // so "John's" can be converted to `john-s` instead of `johns`
  let slug = slugg(name, {
    toStrip: /["”“]/g,
  });

  // If can't build a slug out of user's name (e.g. if it contains only emojis)
  // removes the "s-" part of a slug
  if (slug === "s-personal-collection") {
    slug = slug.replace("s-", "");
  }

  return slug;
}

export function collection(collection) {
  const isSystemCollection =
    !collection || collection.id === null || typeof collection.id === "string";

  if (isSystemCollection) {
    const id = collection && collection.id ? collection.id : "root";
    return `/collection/${id}`;
  }

  const isPersonalCollection = typeof collection.personal_owner_id === "number";
  const slug = isPersonalCollection
    ? slugifyPersonalCollection(collection)
    : slugg(collection.name);

  return appendSlug(`/collection/${collection.id}`, slug);
}

export function isCollectionPath(path) {
  return /collection\/.*/.test(path);
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

export function accountSettings() {
  return `/account/profile`;
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

export function newDatabase() {
  return `/admin/databases/create`;
}

export function editDatabase(databaseId) {
  return `/admin/databases/${databaseId}`;
}

export function listDatabases() {
  return `/admin/databases`;
}

export function exploreDatabase(database) {
  return `/explore/${database.id}`;
}

export function browseDatabase(database) {
  const name =
    database.id === SAVED_QUESTIONS_VIRTUAL_DB_ID
      ? "Saved Questions"
      : database.name;

  return appendSlug(`/browse/${database.id}`, slugg(name));
}

export function browseSchema(table) {
  return `/browse/${table.db.id}/schema/${table.schema_name}`;
}

export function browseTable(table) {
  return `/browse/${table.db.id}/schema/${table.schema_name}`;
}

export function extractEntityId(slug) {
  const id = parseInt(slug, 10);
  return Number.isSafeInteger(id) ? id : undefined;
}

export function extractCollectionId(slug) {
  if (slug === "root" || slug === "users") {
    return slug;
  }
  return extractEntityId(slug);
}
