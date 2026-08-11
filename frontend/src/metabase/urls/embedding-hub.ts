export const EMBEDDING_HUB_ROOT_PATH = "embedding";

const ROOT_URL = `/${EMBEDDING_HUB_ROOT_PATH}`;

export function embeddingHub() {
  return ROOT_URL;
}

export function embeddingHubGetStarted() {
  return `${ROOT_URL}/get-started`;
}
