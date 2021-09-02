import React from "react";
import { t } from "ttag";
import Tooltip from "metabase/components/Tooltip";
import { StoreIcon, StoreIconRoot } from "./StoreLink.styled";

const StoreLink = () => {
  return (
    <Tooltip tooltip={t`Explore paid features`}>
      <StoreIconRoot as="a" href="metabase.com" target="_blank">
        <StoreIcon name="store" size={18} />
      </StoreIconRoot>
    </Tooltip>
  );
};

export default StoreLink;
