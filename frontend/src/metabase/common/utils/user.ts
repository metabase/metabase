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

/**
 * Stable seed for one named party's avatar. Every surface showing the same person must derive the
 * same seed, so this prefers the server-computed `common_name` (a full name, or the email when
 * there is no name) and falls back only when a caller has less than that.
 */
export function avatarSeed(namedParty: Named): string {
  if (isUser(namedParty)) {
    const fullName = [namedParty.first_name, namedParty.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return namedParty.common_name || fullName || namedParty.email || "";
  }
  return namedParty.name;
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

export const isUser = (user: Named): user is PartialUser => {
  return "common_name" in user || "email" in user;
};

function initial(name?: string | null) {
  return name ? name.charAt(0).toUpperCase() : "";
}
