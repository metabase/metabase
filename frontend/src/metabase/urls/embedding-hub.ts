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

/**
 * The wizard hangs off whichever hub tab opened it, so its own tab stays
 * selected while it is open and closing it returns there (EMB-2362).
 */
type NewEmbedParams = {
  resourceType?: string | null;
  resourceId?: string | number | null;
  isGuest?: boolean;
  useExistingUserSession?: boolean;
};

export function embeddingHubNewEmbed(
  tabUrl: string,
  params: NewEmbedParams = {},
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value != null) {
      searchParams.set(key, String(value));
    }
  }

  const search = searchParams.toString();

  return search ? `${tabUrl}/new-embed?${search}` : `${tabUrl}/new-embed`;
}
