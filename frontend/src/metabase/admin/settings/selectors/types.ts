import type { ComponentType } from "react";

import type { Settings } from "metabase-types/api";

import type { SettingElement } from "../types";

export type AdminSettingSectionKey =
  | "setup"
  | "general"
  | "updates"
  | "email"
  | "email/smtp"
  | "notifications/slack"
  | "notifications"
  | "authentication"
  | "maps"
  | "localization"
  | "uploads"
  | "public-sharing"
  | "embedding-in-other-applications"
  | "embedding-in-other-applications/standalone"
  | "embedding-in-other-applications/full-app"
  | "license"
  | "metabot"
  | "llm"
  | "cloud";

export type AdminSettingSection = {
  name?: string;
  order?: number;
  key?: string;
  settings: SettingElement[];
  component?: ComponentType<any>;
  adminOnly?: boolean;
  tabs?:
    | {
        isActive: boolean;
        name: string;
        key: string;
        to: string;
      }[]
    | undefined;
  getHidden?: (settings: Settings) => boolean;
};

export type Sections = Record<AdminSettingSectionKey, AdminSettingSection>;
