import type {
  CardId,
  CollectionId,
  NativeQuerySnippetId,
} from "metabase-types/api";

const ROOT_URL = "/data-studio";

export function dataStudio() {
  return ROOT_URL;
}

export function dataStudioModeling() {
  return `${ROOT_URL}/modeling`;
}

export function newDataStudioQueryModel() {
  return `${dataStudioModeling()}/models/new/query`;
}

export function newDataStudioNativeModel() {
  return `${dataStudioModeling()}/models/new/native`;
}

export function dataStudioModel(cardId: CardId) {
  return `${dataStudioModeling()}/models/${cardId}`;
}

export function dataStudioModelQuery(cardId: CardId) {
  return `${dataStudioModel(cardId)}/query`;
}

export function dataStudioModelFields(cardId: CardId) {
  return `${dataStudioModel(cardId)}/fields`;
}

export function dataStudioModelDependencies(cardId: CardId) {
  return `${dataStudioModel(cardId)}/dependencies`;
}

export function newDataStudioMetric() {
  return `${dataStudioModeling()}/metrics/new`;
}

export function dataStudioMetric(cardId: CardId) {
  return `${dataStudioModeling()}/metrics/${cardId}`;
}

export function dataStudioMetricQuery(cardId: CardId) {
  return `${dataStudioMetric(cardId)}/query`;
}

export function dataStudioMetricDependencies(cardId: CardId) {
  return `${dataStudioMetric(cardId)}/dependencies`;
}

export function dataStudioGlossary() {
  return `${dataStudioModeling()}/glossary`;
}

export function dataStudioCollection(collectionId: CollectionId) {
  return `${dataStudioModeling()}/collections/${collectionId}`;
}

export function dataStudioSnippet(snippetId: NativeQuerySnippetId) {
  return `${dataStudioModeling()}/snippets/${snippetId}`;
}

export function dataStudioSnippetDependencies(snippetId: NativeQuerySnippetId) {
  return `${dataStudioSnippet(snippetId)}/dependencies`;
}

export function newDataStudioSnippet() {
  return `${dataStudioModeling()}/snippets/new`;
}
