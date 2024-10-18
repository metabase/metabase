import { FixedSizeIcon, type IconProps } from "metabase/ui";

import { upsellColors } from "./Upsells.styled";

export const UpsellGem = (props: Omit<IconProps, "name" | "color">) => (
  <FixedSizeIcon size={16} name="gem" color={upsellColors.gem} {...props} />
);
