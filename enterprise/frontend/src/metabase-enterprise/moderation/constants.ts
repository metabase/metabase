import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";

export const MODERATION_STATUS = {
  verified: "verified",
};

export const MODERATION_STATUS_ICONS: Record<
  string,
  { name: IconName; color: ColorName }
> = {
  verified: {
    name: "verified",
    color: "brand",
  },
  verified_filled: {
    name: "verified_filled",
    color: "brand",
  },
  // NOTE: This is the string 'null'
  null: {
    name: "close",
    color: "text-light",
  },
};
