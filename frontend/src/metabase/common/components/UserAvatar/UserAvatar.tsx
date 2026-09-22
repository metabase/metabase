import { forwardRef } from "react";

import {
  type Named,
  type PartialGroup,
  type PartialTenant,
  type PartialUser,
  avatarSeed,
  prepareInitials,
} from "metabase/common/utils/user";
import { Avatar, type AvatarProps } from "metabase/ui";

import { avatarDataUri } from "./avatar-image";

export type UserAvatarProps = Omit<AvatarProps, "src" | "name"> & {
  user: PartialUser | PartialGroup | PartialTenant;
  /** For places that already render the name next to the avatar. */
  decorative?: boolean;
};

export const UserAvatar = forwardRef<HTMLDivElement, UserAvatarProps>(
  function UserAvatar({ user, decorative, size = "3em", ...props }, ref) {
    // Mantine falls back to initials if the generated image ever fails to paint.
    const initials = prepareInitials(user) ?? undefined;
    const label = getLabel(user);

    return (
      <Avatar
        {...props}
        ref={ref}
        size={size}
        src={avatarDataUri(avatarSeed(user))}
        name={initials}
        alt={decorative ? "" : label}
        aria-hidden={decorative || undefined}
        title={decorative ? undefined : label}
      />
    );
  },
);

function getLabel(namedParty: Named): string {
  if ("name" in namedParty) {
    return namedParty.name;
  }
  return namedParty.common_name ?? namedParty.email ?? "";
}
