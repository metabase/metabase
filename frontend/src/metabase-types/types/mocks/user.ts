import { User } from "../User";

export const createMockUser = ({
  id = 1,
  first_name = "Testy",
  last_name = "Tableton",
  common_name = `${first_name} ${last_name}`,
  email = "user@metabase.test",
  google_auth = false,
  is_active = true,
  is_qbnewb = false,
  is_superuser = false,
  date_joined = new Date().toISOString(),
  last_login = new Date().toISOString(),
}: Partial<User> = {}): User => ({
  id,
  common_name,
  first_name,
  last_name,
  email,
  google_auth,
  is_active,
  is_qbnewb,
  is_superuser,
  date_joined,
  last_login,
});
