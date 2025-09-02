/* eslint-disable no-restricted-syntax -- we should find a way to use semantic colors here */

import { Avatar, rem } from "@mantine/core";

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

export const avatarOverrides = {
  Avatar: Avatar.extend({
    defaultProps: {
      allowedInitialsColors: avatarColors,
      color: "initials",
      size: rem(24),
      variant: "filled",
    },
  }),
};
