import type { User, UserInfo, UserListResult } from "metabase-types/api";

export const createMockUser = (opts?: Partial<User>): User => ({
  id: 1,
  first_name: "Testy",
  last_name: "Tableton",
  common_name: `Testy Tableton`,
  custom_homepage: null,
  email: "user@metabase.test",
  locale: null,
  google_auth: false,
  login_attributes: null,
  is_active: true,
  is_qbnewb: false,
  is_superuser: false,
  is_installer: false,
  has_invited_second_user: false,
  has_question_and_dashboard: false,
  personal_collection_id: 1,
  date_joined: new Date().toISOString(),
  first_login: new Date().toISOString(),
  last_login: new Date().toISOString(),
  ...opts,
});

export const createMockUserListResult = (
  opts?: Partial<UserListResult>,
): UserListResult => ({
  id: 1,
  first_name: "Testy",
  last_name: "Tableton",
  common_name: "Testy Tableton",
  email: "user@metabase.test",
  personal_collection_id: 2,
  ...opts,
});

export const createMockUserInfo = (opts?: Partial<UserInfo>): UserInfo => ({
  id: 1,
  first_name: "Testy",
  last_name: "Tableton",
  common_name: `Testy Tableton`,
  email: "user@metabase.test",
  is_qbnewb: false,
  is_superuser: false,
  date_joined: new Date().toISOString(),
  last_login: new Date().toISOString(),
  ...opts,
});
