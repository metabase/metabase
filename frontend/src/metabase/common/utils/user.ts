import { isEmail } from "metabase/utils/email";
import type { BaseUser, Group, Tenant } from "metabase-types/api";

// Requires at least an `email` or `common_name` (mirroring `isUser` below), so
// name-only objects like a tenant's `{ name }` can't be passed as first_name alone.
export type PartialUser = Partial<
  Pick<BaseUser, "first_name" | "last_name" | "email" | "common_name">
> &
  (Pick<BaseUser, "email"> | Pick<BaseUser, "common_name">);
export type PartialGroup = Pick<Group, "name">;

export type PartialTenant = Pick<Tenant, "name">;

export type Named = PartialUser | PartialGroup | PartialTenant;

export function prepareInitials(namedParty: Named): string | null {
  if (isUser(namedParty)) {
    return (
      initial(namedParty.first_name) + initial(namedParty.last_name) ||
      emailInitials(namedParty)
    );
  } else {
    return initial(namedParty.name) || null;
  }
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

const isUser = (user: Named): user is PartialUser => {
  return "common_name" in user || "email" in user;
};

function initial(name?: string | null) {
  return name ? name.charAt(0).toUpperCase() : "";
}
