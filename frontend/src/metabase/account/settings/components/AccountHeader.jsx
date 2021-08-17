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
  user: PropTypes.object.isRequired,
  path: PropTypes.string,
  onChangeLocation: PropTypes.func,
};

const AccountHeader = ({ user, path, onChangeLocation }) => {
  const hasPasswordChange = useMemo(
    () => PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS.every(f => f(user)),
    [user],
  );

  const tabs = useMemo(
    () => [
      { name: t`Profile`, value: "/account/profile" },
      ...(hasPasswordChange
        ? [{ name: t`Password`, value: "/account/password" }]
        : []),
      { name: t`Login History`, value: "/account/login-history" },
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
        value={path}
        variant="underlined"
        options={tabs}
        onChange={onChangeLocation}
      />
    </AccountHeaderRoot>
  );
};

AccountHeader.propTypes = propTypes;

export default AccountHeader;
