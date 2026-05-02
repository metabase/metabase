import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Flex, Icon, Tooltip } from "metabase/ui";

import S from "./StoreLink.module.css";

const StoreLink = () => {
  return (
    <Tooltip label={t`Explore paid features`}>
      <ExternalLink
        href="https://metabase.com/upgrade"
        data-testid="store-link"
        className={S.root}
      >
        <Flex align="center" justify="center" className={S.iconWrapper}>
          <Icon name="store" size={20} />
        </Flex>
      </ExternalLink>
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StoreLink;
