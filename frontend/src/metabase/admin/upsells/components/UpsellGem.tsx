import { Icon } from "metabase/ui";

import { upsellColors } from "./Upsells.styled";

export const UpsellGem = ({ size = 16 }: { size?: number }) => {
  return <Icon name="gem" size={size} color={upsellColors.gem} />;
};
