import { FixedSizeIcon, type IconProps } from "metabase/ui";

export const UpsellGem = (props: Omit<IconProps, "name" | "color">) => (
  <FixedSizeIcon
    size={16}
    name="gem"
    color="var(--mb-color-upsell-gem)"
    {...props}
  />
);
