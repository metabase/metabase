import type {
  User,
  UserInfo,
  UserListResult,
  UserPermissions,
} from "metabase-types/api";

export const createMockUser = (opts?: Partial<User>): User => {
  const firstName = opts?.first_name ?? "Testy";
  const lastName = opts?.last_name ?? "Tableton";
  return {
    id: 1,
    first_name: firstName,
    last_name: lastName,
    common_name: [firstName, lastName].filter(Boolean).join(" "),
    custom_homepage: null,
    email: "user@metabase.test",
    locale: null,
    attributes: null,
    login_attributes: null,
    is_active: true,
    is_qbnewb: false,
    is_superuser: false,
    is_data_analyst: false,
    is_installer: false,
    has_invited_second_user: false,
    has_question_and_dashboard: false,
    personal_collection_id: 1,
    date_joined: new Date().toISOString(),
    first_login: new Date().toISOString(),
    last_login: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sso_source: null,
    permissions: createMockUserPermissions(),
    can_write_any_collection: true,
    tenant_id: null,
    tenant_collection_id: null,
    ...opts,
  };
};

export const createMockUserPermissions = (
  opts?: Partial<UserPermissions>,
): UserPermissions => {
  return { ...opts };
};

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
