import { FixedSizeIcon } from "metabase/ui";

import { upsellColors } from "./Upsells.styled";

export const UpsellGem = ({ size = 16 }: { size?: number }) => {
  return <FixedSizeIcon name="gem" size={size} color={upsellColors.gem} />;
};
