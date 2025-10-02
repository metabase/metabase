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
type LoginStatusUninitialized = {
  status: "uninitialized";
};

/**
 * @inline
 */
type LoginStatusSuccess = {
  status: "success";
};

/**
 * @inline
 */
type LoginStatusLoading = {
  status: "loading";
};

/**
 * @inline
 */
export type LoginStatusError = {
  status: "error";
  error: Error;
};

export type LoginStatus =
  | LoginStatusUninitialized
  | LoginStatusSuccess
  | LoginStatusLoading
  | LoginStatusError;
