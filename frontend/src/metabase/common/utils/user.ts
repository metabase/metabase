import { isEmail } from "metabase/lib/email";
import type { Group, User } from "metabase-types/api";

export function userInitials(user: User | Group) {
  if (user) {
    return nameInitials(user) || emailInitials(user as User);
  }

  return null;
}

function nameInitials(user: User | Group) {
  if ("common_name" in user) {
    return initial(user.first_name) + initial(user.last_name);
  }

  // render group
  return initial(user.name);
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
