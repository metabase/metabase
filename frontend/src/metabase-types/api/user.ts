import type { CollectionId } from "./collection";
import type { DashboardId } from "./dashboard";

export type UserId = number;

export type UserAttribute = string;

export interface BaseUser {
  id: UserId;
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
}

export interface User extends BaseUser {
  google_auth: boolean;
  login_attributes: Record<UserAttribute, UserAttribute> | null;
  user_group_memberships?: { id: number; is_group_manager: boolean }[];
  is_installer: boolean;
  has_invited_second_user: boolean;
  has_question_and_dashboard: boolean;
  personal_collection_id: CollectionId;
  sso_source: "saml" | null;
  custom_homepage: {
    dashboard_id: DashboardId;
  } | null;
}

export interface UserListResult {
  id: UserId;
  first_name: string | null;
  last_name: string | null;
  common_name: string;
  email: string;
  personal_collection_id: CollectionId;
}

export interface UserListMetadata {
  total: number;
}

// Used when hydrating `creator` property
export type UserInfo = Pick<
  BaseUser,
  | "id"
  | "common_name"
  | "first_name"
  | "last_name"
  | "email"
  | "date_joined"
  | "last_login"
  | "is_superuser"
  | "is_qbnewb"
>;

export type UserListQuery = {
  recipients?: boolean;
  limit?: number;
  offset?: number;
};

export type UserLoginHistoryItem = {
  timestamp: string;
  device_description: string;
  ip_address: string;
  location: string;
  active: boolean;
  timezone: string | null;
};

export type UserLoginHistory = UserLoginHistoryItem[];

export type CreateUserRequest = Pick<
  User,
  | "email"
  | "first_name"
  | "last_name"
  | "user_group_memberships"
  | "login_attributes"
>;

export type CreateUserResponse =
  | Pick<
      User,
      | "common_name"
      | "date_joined"
      | "email"
      | "first_name"
      | "id"
      | "is_active"
      | "is_superuser"
      | "is_qbnewb"
      | "last_name"
      | "last_login"
      | "locale"
      | "login_attributes"
      | "sso_source"
      | "user_group_memberships"
    >
  | {
      updated_at: string;
    };

export type UpdatePasswordRequest = {
  id: UserId;
  password: string;
  old_password?: string;
};

export type ListUsersRequest = {
  status?: "deactivated" | "all";
  query?: string;
  group_id?: number;
  include_deactivated?: boolean;
};

export type ListUsersResponse = {
  data: User[];
  total: number;
  limit: number | null;
  offset: number | null;
};
