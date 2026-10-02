import type { OAuthClient, OAuthClientId } from "metabase-types/api";

/** `TreeNodeData` requires an `id`, which the list response does not carry: a client's identity is its `client_id`. */
export type OAuthClientRow = OAuthClient & { id: OAuthClientId };
