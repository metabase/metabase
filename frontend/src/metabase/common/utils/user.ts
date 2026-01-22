import { isEmail } from "metabase/lib/email";
import type { Group, User } from "metabase-types/api";

export function userInitials(
  user:
    | Partial<Pick<User, "first_name" | "last_name" | "email" | "common_name">>
    | Pick<Group, "name">,
) {
  if (user) {
    return nameInitials(user) || emailInitials(user as User);
  }

  return null;
}

function nameInitials(
  user:
    | Partial<Pick<User, "first_name" | "last_name" | "common_name">>
    | Pick<Group, "name">,
) {
  if ("common_name" in user) {
    return initial(user.first_name) + initial(user.last_name);
  }

  // render group
  return initial((user as Group).name);
}
export function initial(name?: string | null) {
  return name ? name.charAt(0).toUpperCase() : "";
}

function emailInitials(user: User) {
  const email = [user.email, user.common_name].find((maybeEmail) =>
    isEmail(maybeEmail),
  );
  if (email) {
    const emailUsername = email.split("@")[0];
    return emailUsername.slice(0, 2).toUpperCase();
  }

  return null;
}
