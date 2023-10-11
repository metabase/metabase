import type { User } from "metabase-types/api";

export function getFullName(
  user: Pick<User, "first_name" | "last_name">,
): string | null {
  return [user.first_name, user.last_name].join(" ").trim() || null;
}
