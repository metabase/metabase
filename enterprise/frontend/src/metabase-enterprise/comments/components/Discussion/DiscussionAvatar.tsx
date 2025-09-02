// TODO: move Avatar component to metabase/ui
/* eslint-disable no-restricted-imports */
import { Avatar, rem } from "@mantine/core";

import type { BaseUser } from "metabase-types/api";

type DiscussionAvatarProps = {
  user: BaseUser;
};

const avatarColors = [
  "var(--mb-base-color-lobster-40)",
  "var(--mb-base-color-flamingo-40)",
  "var(--mb-base-color-mango-40)",
  "var(--mb-base-color-orion-40)",
  "var(--mb-base-color-dubloon-40)",
  "var(--mb-base-color-palm-40)",
  "var(--mb-base-color-seafoam-40)",
  "var(--mb-base-color-octopus-40)",
];

export function DiscussionAvatar({ user }: DiscussionAvatarProps) {
  return (
    <Avatar
      allowedInitialsColors={avatarColors}
      color="initials"
      name={user.common_name}
      size={rem(24)}
      variant="filled"
    />
  );
}
