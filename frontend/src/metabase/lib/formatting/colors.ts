import { color } from "metabase/lib/colors";

export function assignUserColors(
  userIds,
  currentUserId,
  colors = [
    color("brand"),
    color("accent2"),
    color("error"),
    color("accent1"),
    color("accent4"),
    color("bg-medium"),
  ],
) {
  const assignments = {};

  const currentUserColor = colors[0];
  const otherUserColors = colors.slice(1);
  let otherUserColorIndex = 0;

  for (const userId of userIds) {
    if (!(userId in assignments)) {
      if (userId === currentUserId) {
        assignments[userId] = currentUserColor;
      } else if (userId != null) {
        assignments[userId] =
          otherUserColors[otherUserColorIndex++ % otherUserColors.length];
      }
    }
  }

  return assignments;
}
