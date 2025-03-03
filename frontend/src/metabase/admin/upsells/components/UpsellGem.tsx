import { Icon, type IconProps } from "metabase/ui";

import S from "./Upsells.module.css";

export const UpsellGem = (props: Omit<IconProps, "name" | "color">) => (
  <Icon size={16} name="gem" className={S.UpsellGem} {...props} />
);
