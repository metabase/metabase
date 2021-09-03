import React from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { StoreIconRoot } from "./StoreLink.styled";

const StoreLink = () => {
  return (
    <Tooltip tooltip={t`Explore paid features`}>
      <a href="https://metabase.com" target="_blank" rel="noreferrer">
        <StoreIconRoot>
          <Icon name="store" m={1} size={18} />
        </StoreIconRoot>
      </a>
    </Tooltip>
  );
};

export default StoreLink;
