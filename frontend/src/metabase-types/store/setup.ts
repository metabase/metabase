import type { SetupStep } from "metabase/setup/types";
import type { DatabaseData, UsageReason } from "metabase-types/api";

export interface Locale {
  name: string;
  code: string;
}

export interface UserInfo {
  first_name: string | null;
  last_name: string | null;
  email: string;
  site_name: string;
  password: string;
  password_confirm: string;
}

export interface InviteInfo {
  first_name: string | null;
  last_name: string | null;
  email: string;
}

export interface SubscribeInfo {
  email: string;
}

export interface SetupState {
  step: SetupStep;
  locale?: Locale;
  user?: UserInfo;
  usageReason?: UsageReason;
  databaseEngine?: string;
  database?: DatabaseData;
  invite?: InviteInfo;
  isLocaleLoaded: boolean;
  isTrackingAllowed: boolean;
  licenseToken?: string | null;
}
