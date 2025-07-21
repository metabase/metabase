import type {
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
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
    "useExistingUserSession",
  ] satisfies (keyof SdkIframeEmbedBaseSettings)[],
  dashboard: [
    "dashboardId",
    "withTitle",
    "withDownloads",
    "initialParameters",
    "hiddenParameters",
    "isDrillThroughEnabled",
  ] satisfies (keyof DashboardEmbedOptions)[],
  chart: [
    "questionId",
    "withTitle",
    "withDownloads",
    "initialSqlParameters",
    "isDrillThroughEnabled",
  ] satisfies (keyof QuestionEmbedOptions)[],
  exploration: [
    "template",
    "isSaveEnabled",
    "targetCollection",
    "entityTypes",
  ] satisfies (keyof ExplorationEmbedOptions)[],
};

// This file is used by embed.js, so we shouldn't import external dependencies.
const uniq = <T>(list: T[]): T[] => Array.from(new Set(list));

export const ALLOWED_EMBED_SETTING_KEYS = uniq([
  ...ALLOWED_EMBED_SETTING_KEYS_MAP.base,
  ...ALLOWED_EMBED_SETTING_KEYS_MAP.dashboard,
  ...ALLOWED_EMBED_SETTING_KEYS_MAP.chart,
  ...ALLOWED_EMBED_SETTING_KEYS_MAP.exploration,
]) satisfies SdkIframeEmbedSettingKey[];

export type AllowedEmbedSettingKey =
  (typeof ALLOWED_EMBED_SETTING_KEYS)[number];

/** Prevent updating these fields with `embed.updateSettings()` after the embed is created. */
export const DISABLE_UPDATE_FOR_KEYS = [
  "instanceUrl",
  "useExistingUserSession",
] as const satisfies AllowedEmbedSettingKey[];
