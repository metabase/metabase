export interface Locale {
  name: string;
  code: string;
}

export interface UserInfo {
  first_name: string;
  last_name: string;
  password: string;
}

export interface DatabaseInfo {
  name: string;
  engine: string;
}

export type LocaleData = [string, string];
