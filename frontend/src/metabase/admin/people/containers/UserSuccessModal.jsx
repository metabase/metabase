/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { push } from "react-router-redux";
import { jt, t } from "ttag";
import _ from "underscore";

import ModalContent from "metabase/components/ModalContent";
import PasswordReveal from "metabase/components/PasswordReveal";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import Users from "metabase/entities/users";
import { connect } from "metabase/lib/redux";
import { getSetting, isSsoEnabled } from "metabase/selectors/settings";

import { clearTemporaryPassword } from "../people";
import { getUserTemporaryPassword } from "../selectors";

import { PasswordSuccessMessage } from "./UserSuccessModal.styled";

class UserSuccessModal extends Component {
  componentWillUnmount() {
    this.props.clearTemporaryPassword(this.props.params.userId);
  }

  render() {
    const {
      onClose,
      user,
      temporaryPassword,
      isSsoEnabled,
      isPasswordLoginEnabled,
    } = this.props;
    const ssoEnabled = isSsoEnabled && !isPasswordLoginEnabled;
    return (
      <ModalContent
        title={t`${user.common_name} has been added`}
        footer={<Button primary onClick={() => onClose()}>{t`Done`}</Button>}
        onClose={onClose}
      >
        {temporaryPassword ? (
          <PasswordSuccess user={user} temporaryPassword={temporaryPassword} />
        ) : (
          <EmailSuccess isSsoEnabled={ssoEnabled} user={user} />
        )}
      </ModalContent>
    );
  }
}

const EmailSuccess = ({ user, isSsoEnabled }) => {
  if (isSsoEnabled) {
    return (
      <div>{jt`We’ve sent an invite to ${(
        <strong key="email">{user.email}</strong>
      )} with instructions to log in. If this user is unable to authenticate then you can ${(
        <Link
          key="link"
          to={`/admin/people/${user.id}/reset`}
          className={CS.link}
        >{t`reset their password.`}</Link>
      )}`}</div>
    );
  }
  return (
    <div>{jt`We’ve sent an invite to ${(
      <strong key="email">{user.email}</strong>
    )} with instructions to set their password.`}</div>
  );
};

const PasswordSuccess = ({ user, temporaryPassword }) => (
  <div>
    <PasswordSuccessMessage>
      {jt`We couldn’t send them an email invitation, so make sure to tell them to log in using ${(
        <strong key="email">{user.email}</strong>
      )} and this password we’ve generated for them:`}
    </PasswordSuccessMessage>

    <PasswordReveal password={temporaryPassword} />
    <div
      style={{ paddingLeft: "5em", paddingRight: "5em" }}
      className={cx(CS.pt4, CS.textCentered)}
    >
      {jt`If you want to be able to send email invites, just go to the ${(
        <Link
          key="link"
          to="/admin/settings/email"
          className={cx(CS.link, CS.textBold)}
        >
          Email Settings
        </Link>
      )} page.`}
    </div>
  </div>
);
export default _.compose(
  Users.load({
    id: (state, props) => props.params.userId,
  }),
  connect(
    (state, props) => ({
      temporaryPassword: getUserTemporaryPassword(state, {
        userId: props.params.userId,
      }),
      isSsoEnabled: isSsoEnabled(state),
      isPasswordLoginEnabled: getSetting(state, "enable-password-login"),
    }),
    {
      onClose: () => push("/admin/people"),
      clearTemporaryPassword,
    },
  ),
)(UserSuccessModal);
