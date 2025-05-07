import { color } from "metabase/lib/colors";
import type { Tenant } from "metabase-types/api";

const groupColorPalette = [
  color("error"),
  color("accent2"),
  color("brand"),
  color("accent4"),
  color("accent1"),
];

export const tenantIdToColor = (tenantId: Tenant["id"]) => {
  return groupColorPalette[tenantId % groupColorPalette.length];
};
