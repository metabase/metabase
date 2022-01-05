import { User } from "metabase-types/api";

export const createUser = (opts?: Partial<User>): User => ({
  id: 1,
  first_name: "Testy",
  is_superuser: false,
  has_invited_second_user: false,
  personal_collection_id: 1,
  ...opts,
});
