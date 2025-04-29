import type { MetabaseTheme } from "embedding-sdk";

/** Events that the embed.js script listens for */
export type SdkIframeEmbedTagMessage = {
  type: "metabase.embed.iframeReady";
};

/** Events that the sdk embed route listens for */
export type SdkIframeEmbedMessage = {
  type: "metabase.embed.updateSettings";
  data: SdkIframeEmbedSettings;
};

/** Settings used by the sdk embed route */
export interface SdkIframeEmbedSettings {
  apiKey: string;
  instanceUrl: string;

  dashboardId?: number | string;
  questionId?: number | string;
  notebookEditor?: boolean;

  theme?: MetabaseTheme;
  locale?: string;
}

/** Settings used by the embed.js constructor */
export type SdkIframeEmbedTagSettings = SdkIframeEmbedSettings & {
  target: string | HTMLElement;
  iframeClassName?: string;
};
