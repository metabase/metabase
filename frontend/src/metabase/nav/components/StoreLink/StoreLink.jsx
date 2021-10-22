import React from "react";
import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";

import { StoreIcon, StoreIconRoot, StoreIconWrapper } from "./StoreLink.styled";

const StoreLink = () => {
  return (
    <Tooltip tooltip={t`Explore paid features`}>
      <StoreIconRoot href="https://metabase.com/upgrade">
        <StoreIconWrapper>
          <StoreIcon />
        </StoreIconWrapper>
      </StoreIconRoot>
    </Tooltip>
  );
};

export default StoreLink;
