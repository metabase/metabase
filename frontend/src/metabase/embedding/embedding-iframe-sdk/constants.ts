import type {
  BrowserEmbedOptions,
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  MetabotEmbedOptions,
  QuestionEmbedOptions,
  SdkIframeEmbedBaseSettings,
  SdkIframeEmbedSettingKey,
} from "./types/embed";

/**
 * The timeout to wait for a session token from the embed.js script.
 * This is a fallback in case the embed.js script doesn't send a message.
 *
 * This is set to 5 minutes to leave room for SSO auth to complete.
 */
export const WAIT_FOR_SESSION_TOKEN_TIMEOUT = 5 * 60 * 1000;

export const ALLOWED_EMBED_SETTING_KEYS_MAP = {
  base: [
    "apiKey",
    "instanceUrl",
    "theme",
    "locale",
    "preferredAuthMethod",
    "fetchRequestToken",
    "useExistingUserSession",
    "isGuest",
    "jwtProviderUri",
  ] satisfies (keyof SdkIframeEmbedBaseSettings)[],
  dashboard: [
    "dashboardId",
    "autoRefreshInterval",
    "withTitle",
    "withDownloads",
    "withSubscriptions",
    "initialParameters",
    "hiddenParameters",
    "drills",
    "enableEntityNavigation",
  ] satisfies (keyof DashboardEmbedOptions)[],
  chart: [
    "questionId",
    "isSaveEnabled",
    "withTitle",
    "withDownloads",
    "withAlerts",
    "initialSqlParameters",
    "hiddenParameters",
    "drills",
    "entityTypes",
  ] satisfies (keyof QuestionEmbedOptions)[],
  exploration: [
    "template",
    "questionId",
    "isSaveEnabled",
    "targetCollection",
    "entityTypes",
  ] satisfies (keyof ExplorationEmbedOptions)[],
  browser: [
    "initialCollection",
    "readOnly",
    "collectionVisibleColumns",
    "collectionEntityTypes",
    "collectionPageSize",
    "dataPickerEntityTypes",
    "withNewQuestion",
    "withNewDashboard",
    "enableEntityNavigation",
  ] satisfies (keyof BrowserEmbedOptions)[],
  metabot: [
    "layout",
    "isSaveEnabled",
    "targetCollection",
  ] satisfies (keyof MetabotEmbedOptions)[],
} as const;

export const ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP = {
  base: [
    "apiKey",
    "instanceUrl",
    "theme",
    "locale",
    "isGuest",
  ] satisfies (keyof SdkIframeEmbedBaseSettings)[],
  dashboard: [
    "token",
    "autoRefreshInterval",
    "withTitle",
    "withDownloads",
    "initialParameters",
  ] satisfies (keyof DashboardEmbedOptions)[],
  chart: [
    "token",
    "withTitle",
    "withDownloads",
    "entityTypes",
    "initialSqlParameters",
  ] satisfies (keyof QuestionEmbedOptions)[],
  exploration: [] satisfies (keyof ExplorationEmbedOptions)[],
  browser: [] satisfies (keyof BrowserEmbedOptions)[],
  metabot: [] satisfies (keyof MetabotEmbedOptions)[],
} as const;

// This file is used by embed.js, so we shouldn't import external dependencies.
const uniq = <T>(list: T[]): T[] => Array.from(new Set(list));

export const ALLOWED_EMBED_SETTING_KEYS = uniq([
  ...ALLOWED_EMBED_SETTING_KEYS_MAP.base,
  ...ALLOWED_EMBED_SETTING_KEYS_MAP.dashboard,
  ...ALLOWED_EMBED_SETTING_KEYS_MAP.chart,
  ...ALLOWED_EMBED_SETTING_KEYS_MAP.exploration,
  ...ALLOWED_EMBED_SETTING_KEYS_MAP.browser,
  ...ALLOWED_EMBED_SETTING_KEYS_MAP.metabot,
]) satisfies SdkIframeEmbedSettingKey[];

export const ALLOWED_GUEST_EMBED_SETTING_KEYS = uniq([
  ...ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP.base,
  ...ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP.dashboard,
  ...ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP.chart,
  ...ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP.exploration,
  ...ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP.browser,
]) satisfies SdkIframeEmbedSettingKey[];

export type AllowedEmbedSettingKey = (
  | typeof ALLOWED_EMBED_SETTING_KEYS
  | typeof ALLOWED_GUEST_EMBED_SETTING_KEYS
)[number];

/** Prevent updating these fields with `embed.updateSettings()` after the embed is created. */
export const DISABLE_UPDATE_FOR_KEYS = [
  "instanceUrl",
  "useExistingUserSession",
  "fetchRequestToken",
  "isGuest",
] as const satisfies AllowedEmbedSettingKey[];

export const METABASE_CONFIG_IS_PROXY_FIELD_NAME = "__isProxy";
