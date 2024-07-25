import { FixedSizeIcon } from "metabase/ui";
import { IconContainer } from "metabase/components/MetadataInfo/InfoIcon/InfoIcon.styled";
import { upsellColors } from "./Upsells.styled";

export const UpsellGem = () => {
  return (
    <IconContainer>
      <FixedSizeIcon name="gem" color={upsellColors.gem} />
    </IconContainer>
  );
};
