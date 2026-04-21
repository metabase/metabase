import type { SdkIframeEmbedMessage } from "metabase/embed/iframe-sdk/types/embed";
import type { MetabaseAuthMethod } from "metabase/embed/sdk-bundle/types";
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
