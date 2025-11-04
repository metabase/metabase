import type { CardId } from "metabase-types/api";

const ROOT_URL = "/data-studio";

export function dataStudio() {
  return ROOT_URL;
}

export function dataStudioModelList() {
  return `${ROOT_URL}/models`;
}

export function dataStudioModel(modelId: CardId) {
  return `${dataStudioModelList()}/${modelId}`;
}

export function dataStudioModelQuery(modelId: CardId) {
  return `${dataStudioModel(modelId)}/query`;
}

export function dataStudioModelDependencies(modelId: CardId) {
  return `${dataStudioModel(modelId)}/dependencies`;
}
