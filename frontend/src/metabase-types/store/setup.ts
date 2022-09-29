export interface Locale {
  name: string;
  code: string;
}

export interface UserInfo {
  first_name: string;
  last_name: string;
  email: string;
  site_name: string;
  password: string;
  password_confirm: string;
}

export interface InviteInfo {
  first_name: string;
  last_name: string;
  email: string;
}

export interface DatabaseInfo {
  name: string;
  engine: string;
  details: DatabaseDetails;
}

export interface DatabaseDetails {
  ssl: boolean;
}

export interface SubscribeInfo {
  email: string;
}

export interface SetupState {
  step: number;
  locale?: Locale;
  user?: UserInfo;
  databaseEngine?: string;
  database?: DatabaseInfo;
  invite?: InviteInfo;
  isLocaleLoaded: boolean;
  isTrackingAllowed: boolean;
}
