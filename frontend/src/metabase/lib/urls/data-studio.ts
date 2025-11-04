import type { CardId } from "metabase-types/api";

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

export function dataStudioModel(modelId: CardId) {
  return `${dataStudioModeling()}/models/${modelId}`;
}

export function dataStudioModelQuery(modelId: CardId) {
  return `${dataStudioModel(modelId)}/query`;
}

export function dataStudioModelDependencies(modelId: CardId) {
  return `${dataStudioModel(modelId)}/dependencies`;
}
