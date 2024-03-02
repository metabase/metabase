import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";

import { StoreIcon, StoreIconRoot, StoreIconWrapper } from "./StoreLink.styled";

const StoreLink = () => {
  return (
    <Tooltip tooltip={t`Explore paid features`}>
      <StoreIconRoot href="https://metabase.com/upgrade">
        <StoreIconWrapper>
          <StoreIcon name="store" size={20} />
        </StoreIconWrapper>
      </StoreIconRoot>
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StoreLink;
