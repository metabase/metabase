import type { MetabaseTheme } from "embedding-sdk";
import type {
  EmbedResource,
  EmbedResourceType,
} from "metabase/public/lib/types";

export type IframeAuthConfig =
  | { type: "apiKey"; apiKey: string }
  | { type: "sso" }; // TODO: to be implemented once the new SSO implementation on the SDK is ready

export type SdkIframeEmbedPostMessageAction =
  | {
      type: "metabase.embed.authenticate";
      data: IframeAuthConfig;
    }
  | {
      type: "metabase.embed.updateSettings";
      data: SdkIframeEmbedSettings;
    };

export type SdkIframeEmbedSettings = {
  embedResourceType: EmbedResourceType;
  embedResourceId?: EmbedResource["id"];

  theme?: MetabaseTheme;
};
