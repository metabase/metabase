import { t } from "ttag";

import { Tooltip } from "metabase/ui";

import { StoreIcon, StoreIconRoot, StoreIconWrapper } from "./StoreLink.styled";

const StoreLink = () => {
  return (
    <Tooltip label={t`Explore paid features`}>
      <StoreIconRoot
        href="https://metabase.com/upgrade"
        data-testid="store-link"
      >
        <StoreIconWrapper>
          <StoreIcon name="store" size={20} />
        </StoreIconWrapper>
      </StoreIconRoot>
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StoreLink;
