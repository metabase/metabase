import type { MetabaseTheme } from "embedding-sdk";

/** Events that the embed.js script listens for */
export type SdkIframeEmbedTagMessage = {
  type: "metabase.embed.iframeReady";
};

/** Events that the sdk embed route listens for */
export type SdkIframeEmbedMessage = {
  type: "metabase.embed.setSettings";
  data: SdkIframeEmbedSettings;
};

/** Template to use for the embedded question or dashboard. Will be expanded in the future. */
export type SdkIframeEmbedTemplate = "exploration";

/** Settings used by the sdk embed route */
export interface SdkIframeEmbedSettings {
  apiKey: string;
  instanceUrl: string;

  dashboardId?: number | string;
  questionId?: number | string;
  template?: SdkIframeEmbedTemplate;

  theme?: MetabaseTheme;
  locale?: string;

  // Whether the embed is running on localhost. Cannot be set by the user.
  _isLocalhost?: boolean;
}

/** Settings used by the embed.js constructor */
export type SdkIframeEmbedTagSettings = SdkIframeEmbedSettings & {
  target: string | HTMLElement;
  iframeClassName?: string;
};
