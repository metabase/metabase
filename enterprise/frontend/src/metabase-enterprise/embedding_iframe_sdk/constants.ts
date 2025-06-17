import _ from "underscore";

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

const allowedSettingsKeys = {
  base: [
    "apiKey",
    "instanceUrl",
    "theme",
    "locale",
    "preferredAuthMethod",
  ] satisfies (keyof SdkIframeEmbedBaseSettings)[],
  dashboard: [
    "withTitle",
    "withDownloads",
    "initialParameters",
    "hiddenParameters",
    "isDrillThroughEnabled",
  ] satisfies (keyof DashboardEmbedOptions)[],
  chart: [
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

export const ALLOWED_EMBED_SETTING_KEYS = _.uniq([
  ...allowedSettingsKeys.base,
  ...allowedSettingsKeys.dashboard,
  ...allowedSettingsKeys.chart,
  ...allowedSettingsKeys.exploration,
]) satisfies SdkIframeEmbedSettingKey[];

export type AllowedEmbedSettingKey =
  (typeof ALLOWED_EMBED_SETTING_KEYS)[number];
