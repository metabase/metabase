import React from "react";
import PropTypes from "prop-types";
import AccountHeader from "./AccountHeader";
import { AccountContent, AccountLayoutRoot } from "./AccountLayout.styled";

const propTypes = {
  ...AccountHeader.propTypes,
  children: PropTypes.node,
};

const AccountLayout = ({ children, ...props }) => {
  return (
    <AccountLayoutRoot>
      <AccountHeader {...props} />
      <AccountContent>{children}</AccountContent>
    </AccountLayoutRoot>
  );
};

AccountLayout.propTypes = propTypes;

export default AccountLayout;
