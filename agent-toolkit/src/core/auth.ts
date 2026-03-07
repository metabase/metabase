export interface AuthConfig {
  apiKey?: string;
  sessionToken?: string;
}

export function resolveAuth(opts: {
  apiKey?: string;
  sessionToken?: string;
}): AuthConfig {
  const apiKey = opts.apiKey || process.env.METABASE_API_KEY;
  const sessionToken = opts.sessionToken || process.env.METABASE_SESSION_TOKEN;

  if (!apiKey && !sessionToken) {
    throw new Error(
      "Authentication required. Set METABASE_API_KEY or METABASE_SESSION_TOKEN environment variable, or pass --api-key or --session-token.",
    );
  }

  return { apiKey, sessionToken };
}

export function getAuthHeaders(auth: AuthConfig): Record<string, string> {
  if (auth.apiKey) {
    return { "X-Api-Key": auth.apiKey };
  }
  if (auth.sessionToken) {
    return { "X-Metabase-Session": auth.sessionToken };
  }
  return {};
}
