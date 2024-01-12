import type { User, UserInfo } from "metabase-types/api";

export function getFullName(user: User | UserInfo): string | null {
  return [user.first_name, user.last_name].join(" ").trim() || null;
}
