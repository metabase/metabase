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
  personal_collection_id: number;
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
