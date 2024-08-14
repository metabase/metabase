import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";

export const MODERATION_STATUS = {
  verified: "verified",
};

export const MODERATION_STATUS_ICONS: Map<
  string | null,
  { name: IconName; color: ColorName }
> = new Map();

MODERATION_STATUS_ICONS.set("verified", {
  name: "verified",
  color: "brand",
});

MODERATION_STATUS_ICONS.set("verified_filled", {
  name: "verified_filled",
  color: "brand",
});

MODERATION_STATUS_ICONS.set(null, {
  name: "close",
  color: "text-light",
});
