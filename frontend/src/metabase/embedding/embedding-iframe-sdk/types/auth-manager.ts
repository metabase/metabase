import type { MetabaseAuthMethod } from "embedding-sdk-bundle/types";
import type { SdkIframeEmbedMessage } from "metabase/embedding/embedding-iframe-sdk/types/embed";
import type { MetabaseFetchRequestTokenFn } from "metabase/embedding-sdk/types/refresh-token";

export interface EmbedAuthManagerContext {
  properties: {
    apiKey?: string;
    instanceUrl: string;
    preferredAuthMethod?: MetabaseAuthMethod;
    fetchRequestToken?: MetabaseFetchRequestTokenFn;
    jwtProviderUri?: string;
  };
  sendMessage<Message extends SdkIframeEmbedMessage>(
    type: Message["type"],
    data: Message["data"],
  ): void;
}

export interface EmbedAuthManager {
  authenticate(): Promise<void>;
}

export type EmbedAuthManagerConstructor = new (
  context: EmbedAuthManagerContext,
) => EmbedAuthManager;
