import type { EmbeddingTheme } from "metabase-types/api";

// TODO (Kelvin 2026-07-31) `/embedding-hub` is a working answer to item 1 of 01-questions-for-roman.md, pending Roman. `/embedding` was rejected for sitting three letters from `/embed`, the unauthenticated public embed route. Changing the answer means changing this one constant.
export const EMBEDDING_HUB_ROOT_PATH = "embedding-hub";

const ROOT_URL = `/${EMBEDDING_HUB_ROOT_PATH}`;

export function embeddingHub() {
  return ROOT_URL;
}

export function embeddingHubSecurity() {
  return `${ROOT_URL}/security`;
}

export function embeddingHubAuthentication() {
  return `${ROOT_URL}/authentication`;
}

export function embeddingHubPermissions() {
  return `${ROOT_URL}/permissions`;
}

export function embeddingHubTenancy() {
  return `${ROOT_URL}/tenancy`;
}

export function embeddingHubAppearance() {
  return `${ROOT_URL}/appearance`;
}

export function embeddingHubTheme(themeId: EmbeddingTheme["id"] | "new") {
  return `${embeddingHubAppearance()}/${themeId}`;
}

export function embeddingHubLocalization() {
  return `${ROOT_URL}/localization`;
}
