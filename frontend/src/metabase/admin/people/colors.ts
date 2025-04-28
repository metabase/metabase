import { color } from "metabase/lib/colors";
import type { GroupId, User } from "metabase-types/api";

// const userColorPalette = [
//   color("brand"),
//   color("accent1"),
//   color("accent2"),
//   color("accent3"),
//   color("accent4"),
//];

export const userToColor = (user: User) => {
  return user.is_superuser ? color("accent2") : "var(--mb-color-brand)";
  // return userColorPalette[user.id % userColorPalette.length];
};

const groupColorPalette = [
  color("error"),
  color("accent2"),
  color("brand"),
  color("accent4"),
  color("accent1"),
];

export const groupIdToColor = (groupId: GroupId) => {
  return groupColorPalette[groupId % groupColorPalette.length];
};
