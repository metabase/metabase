import { isEmail } from "metabase/lib/email";
import type { BaseUser, Group } from "metabase-types/api";

export type PartialUser = Partial<
  Pick<BaseUser, "first_name" | "last_name" | "email" | "common_name">
>;
export type PartialGroup = Pick<Group, "name">;

const isUser = (user: PartialUser | PartialGroup): user is PartialUser => {
  return "common_name" in user || "email" in user;
};

export function userInitials(user: PartialGroup | PartialUser) {
  const initials = nameInitials(user);

  if (initials) {
    return initials;
  } else if (isUser(user)) {
    return emailInitials(user);
  }

  return null;
}

function nameInitials(user: PartialUser | PartialGroup) {
  if (isUser(user)) {
    return initial(user.first_name) + initial(user.last_name);
  } else {
    // render group
    return initial(user.name);
  }
}
export function initial(name?: string | null) {
  return name ? name.charAt(0).toUpperCase() : "";
}

function emailInitials(user: PartialUser) {
  const email = [user.email, user.common_name].find((maybeEmail) =>
    isEmail(maybeEmail),
  );
  if (email) {
    const emailUsername = email.split("@")[0];
    return emailUsername.slice(0, 2).toUpperCase();
  }

  return null;
}
