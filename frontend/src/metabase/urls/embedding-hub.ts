export const EMBEDDING_HUB_ROOT_PATH = "embedding";

const ROOT_URL = `/${EMBEDDING_HUB_ROOT_PATH}`;

export function embeddingHub() {
  return ROOT_URL;
}

export function embeddingHubGetStarted() {
  return `${ROOT_URL}/get-started`;
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

export function embeddingHubLocalization() {
  return `${ROOT_URL}/localization`;
}

type NewEmbedParams = {
  resourceType?: string | null;
  resourceId?: string | number | null;
  isGuest?: boolean;
  useExistingUserSession?: boolean;
};

/**
 * The embed wizard is a route rather than a modal dispatch so that opening it
 * pushes a history entry and the browser back button closes it (EMB-2362).
 */
export function embeddingHubNewEmbed(params: NewEmbedParams = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value != null) {
      searchParams.set(key, String(value));
    }
  }

  const search = searchParams.toString();

  return search ? `${ROOT_URL}/new?${search}` : `${ROOT_URL}/new`;
}
