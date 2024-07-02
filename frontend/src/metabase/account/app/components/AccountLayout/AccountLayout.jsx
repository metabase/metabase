import PropTypes from "prop-types";

import { AccountHeader } from "../AccountHeader";

import { AccountContent } from "./AccountLayout.styled";

const propTypes = {
  ...AccountHeader.propTypes,
  children: PropTypes.node,
};

const AccountLayout = ({ children, ...props }) => {
  return (
    <div>
      <AccountHeader {...props} />
      <AccountContent>{children}</AccountContent>
    </div>
  );
};

AccountLayout.propTypes = propTypes;

export default AccountLayout;
