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
  google_auth: boolean;
  is_active: boolean;
  is_qbnewb: boolean;
  is_superuser: boolean;

  date_joined: string;
  last_login: string;
  first_login: string;
};

type LoginStatusUninitialized = {
  status: "uninitialized";
};

type LoginStatusSuccess = {
  status: "success";
};

type LoginStatusLoading = {
  status: "loading";
};

export type LoginStatusError = {
  status: "error";
  error: Error;
};

export type LoginStatus =
  | LoginStatusUninitialized
  | LoginStatusSuccess
  | LoginStatusLoading
  | LoginStatusError;
