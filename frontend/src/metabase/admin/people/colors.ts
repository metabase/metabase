import { color } from "metabase/lib/colors";
import type { GroupId, User } from "metabase-types/api";

export const userToColor = (user: User) => {
  return user.is_superuser ? color("accent2") : color("brand");
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
