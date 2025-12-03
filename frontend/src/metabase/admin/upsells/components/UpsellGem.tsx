import { Icon, type IconProps } from "metabase/ui";

import S from "./UpsellGem.module.css";

export const UpsellGem = (props: Omit<IconProps, "name" | "color">) => (
  <Icon
    data-testid="upsell-gem"
    size={16}
    name="gem"
    className={S.UpsellGem}
    {...props}
  />
);
