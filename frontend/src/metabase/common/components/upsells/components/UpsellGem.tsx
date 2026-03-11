import { Icon, type IconProps } from "metabase/ui";

import S from "./UpsellGem.module.css";

const _UpsellGem = (props: Omit<IconProps, "name" | "color">) => (
  <Icon
    data-testid="upsell-gem"
    size={16}
    name="gem"
    className={S.UpsellGem}
    {...props}
  />
);

const UpsellGemNew = (props: Omit<IconProps, "name" | "color">) => (
  <Icon
    data-testid="upsell-gem"
    size={16}
    name="gem"
    className={S.UpsellGemNew}
    {...props}
  />
);

export const UpsellGem = Object.assign(_UpsellGem, {
  New: UpsellGemNew,
});
