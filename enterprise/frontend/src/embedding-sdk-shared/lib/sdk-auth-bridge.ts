import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

export type JwtAuthStatus = "idle" | "pending" | "fulfilled" | "rejected";

export interface JwtAuthBridgeState {
  status: JwtAuthStatus;
  promise: Promise<MetabaseEmbeddingSessionToken | null> | null;
  token: MetabaseEmbeddingSessionToken | null;
  error: unknown;
  method: "jwt" | null;
  configSignature: string | null;
}

export interface SdkAuthBridge {
  jwt: JwtAuthBridgeState;
}

let fallbackBridge: SdkAuthBridge | null = null;

function createBridge(): SdkAuthBridge {
  return {
    jwt: {
      status: "idle",
      promise: null,
      token: null,
      error: null,
      method: null,
      configSignature: null,
    },
  };
}

export function ensureSdkAuthBridge(): SdkAuthBridge {
  const win = getWindow();

  if (win) {
    if (!win.METABASE_EMBEDDING_SDK_AUTH) {
      win.METABASE_EMBEDDING_SDK_AUTH = createBridge();
    }

    return win.METABASE_EMBEDDING_SDK_AUTH;
  }

  if (!fallbackBridge) {
    fallbackBridge = createBridge();
  }

  return fallbackBridge;
}

export function getJwtAuthBridgeState(): JwtAuthBridgeState {
  return ensureSdkAuthBridge().jwt;
}

export function resetJwtAuthBridgeState() {
  const state = getJwtAuthBridgeState();

  state.status = "idle";
  state.promise = null;
  state.token = null;
  state.error = null;
  state.method = null;
  state.configSignature = null;
}

export function getJwtAuthRequestSignature({
  metabaseInstanceUrl,
  preferredAuthMethod,
}: {
  metabaseInstanceUrl: string;
  preferredAuthMethod?: string;
}) {
  return JSON.stringify({
    metabaseInstanceUrl,
    preferredAuthMethod: preferredAuthMethod ?? null,
  });
}


