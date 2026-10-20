import type { OAuthClient, OAuthClientId } from "metabase-types/api";

/** TreeTable rows need an `id`; a client's is its `client_id`. */
export type OAuthClientRow = OAuthClient & { id: OAuthClientId };
