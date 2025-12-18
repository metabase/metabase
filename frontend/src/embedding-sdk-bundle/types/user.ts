import type { InitializationStatus, InitializationStatusError } from "./ui";

export type SdkUserId = number;

/**
 * The User entity
 */
export type MetabaseUser = {
  id: SdkUserId;
  first_name: string | null;
  last_name: string | null;
  common_name: string;
  email: string;
  locale: string | null;
  date_joined: string;
  last_login: string;
  first_login: string;
};

/**
 * @inline
 */
export type LoginStatusError = InitializationStatusError;

export type LoginStatus = InitializationStatus;
