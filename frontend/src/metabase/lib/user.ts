import { User } from "metabase-types/api";

export function getFullName(user: User): string | null {
  return [user.first_name, user.last_name].join(" ").trim() || null;
}
