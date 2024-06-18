import type { CollectionId } from "./collection";
import type { DashboardId } from "./dashboard";
import type { PaginationRequest, PaginationResponse } from "./pagination";

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
} & PaginationRequest;

export type UserLoginHistoryItem = {
  timestamp: string;
  device_description: string;
  ip_address: string;
  location: string;
  active: boolean;
  timezone: string | null;
};

export type UserLoginHistory = UserLoginHistoryItem[];

export type CreateUserRequest = {
  email: string;
  first_name?: string;
  last_name?: string;
  user_group_memberships?: { id: number; is_group_manager: boolean }[];
  login_attributes?: Record<UserAttribute, UserAttribute>;
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
} & PaginationRequest;

export type ListUsersResponse = {
  data: User[];
} & PaginationResponse;

export type UpdateUserRequest = {
  id: UserId;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  locale?: string | null;
  is_group_manager?: boolean;
  is_superuser?: boolean;
  login_attributes?: Record<UserAttribute, UserAttribute> | null;
  user_group_memberships?: { id: number; is_group_manager: boolean }[];
};
