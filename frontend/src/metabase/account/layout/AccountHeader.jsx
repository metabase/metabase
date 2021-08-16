import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import {
  AccountHeaderRoot,
  HeaderAvatar,
  HeaderSection,
  HeaderTitle,
} from "./AccountHeader.styled";

const propTypes = {
  user: PropTypes.object,
};

const AccountHeader = ({ user }) => {
  return (
    <AccountHeaderRoot>
      <HeaderSection>
        <HeaderAvatar user={user} />
        <HeaderTitle>{t`Account settings`}</HeaderTitle>
      </HeaderSection>
    </AccountHeaderRoot>
  );
};

AccountHeader.propTypes = propTypes;
