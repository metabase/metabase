import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Radio from "metabase/components/Radio";
import { PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS } from "metabase/plugins";
import {
  AccountHeaderRoot,
  HeaderAvatar,
  HeaderSection,
  HeaderTitle,
} from "./AccountHeader.styled";

const propTypes = {
  tab: PropTypes.string,
  user: PropTypes.object,
  onTabChange: PropTypes.func,
};

const AccountHeader = ({ tab, user, onTabChange }) => {
  const hasPasswordChange = useMemo(
    () => PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS.every(f => f(user)),
    [user],
  );

  const tabs = useMemo(
    () => [
      { name: t`Profile`, value: "details" },
      ...(hasPasswordChange ? [{ name: t`Password`, value: "password" }] : []),
      { name: t`Login History`, value: "loginHistory" },
    ],
    [hasPasswordChange],
  );

  return (
    <AccountHeaderRoot>
      <HeaderSection>
        <HeaderAvatar user={user} />
        <HeaderTitle>{t`Account settings`}</HeaderTitle>
      </HeaderSection>
      <Radio
        value={tab}
        variant="underlined"
        options={tabs}
        onChange={onTabChange}
      />
    </AccountHeaderRoot>
  );
};

AccountHeader.propTypes = propTypes;

export default AccountHeader;
