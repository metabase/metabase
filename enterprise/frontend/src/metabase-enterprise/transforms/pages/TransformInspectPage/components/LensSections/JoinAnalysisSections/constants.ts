import type { IconName } from "metabase/ui";

export const JOIN_ICONS: Record<string, IconName> = {
  "left-join": "join_left_outer",
  "right-join": "join_right_outer",
  "inner-join": "join_inner",
  "full-join": "join_full_outer",
};

export const JOIN_LABELS: Record<string, string> = {
  "left-join": "Left Join",
  "right-join": "Right Join",
  "inner-join": "Inner Join",
  "full-join": "Full Join",
};
