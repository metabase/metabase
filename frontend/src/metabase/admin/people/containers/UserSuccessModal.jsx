/* eslint-disable react/prop-types */
import React from "react";
import { t, jt } from "ttag";
import _ from "underscore";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import MetabaseSettings from "metabase/lib/settings";
import User from "metabase/entities/users";

import { Button } from "metabase/core/components/Button";
import { Link } from "metabase/core/components/Link";
import ModalContent from "metabase/components/ModalContent";
import PasswordReveal from "metabase/components/PasswordReveal";
import { getUserTemporaryPassword } from "../selectors";
import { clearTemporaryPassword } from "../people";
import { PasswordSuccessMessage } from "./UserSuccessModal.styled";

class UserSuccessModal extends React.Component {
  componentWillUnmount() {
    this.props.clearTemporaryPassword(this.props.params.userId);
  }
  render() {
    const { onClose, user, temporaryPassword } = this.props;
    const isSsoEnabled =
      MetabaseSettings.isSsoEnabled() &&
      !MetabaseSettings.isPasswordLoginEnabled();
    return (
      <ModalContent
        title={t`${user.common_name} has been added`}
        footer={<Button primary onClick={() => onClose()}>{t`Done`}</Button>}
        onClose={onClose}
      >
        {temporaryPassword ? (
          <PasswordSuccess user={user} temporaryPassword={temporaryPassword} />
        ) : (
          <EmailSuccess isSsoEnabled={isSsoEnabled} user={user} />
        )}
      </ModalContent>
    );
  }
}

const EmailSuccess = ({ user, isSsoEnabled }) => {
  if (isSsoEnabled) {
    return (
      <div>{jt`We’ve sent an invite to ${(
        <strong>{user.email}</strong>
      )} with instructions to log in. If this user is unable to authenticate then you can ${(
        <Link
          to={`/admin/people/${user.id}/reset`}
          className="link"
        >{t`reset their password.`}</Link>
      )}`}</div>
    );
  }
  return (
    <div>{jt`We’ve sent an invite to ${(
      <strong>{user.email}</strong>
    )} with instructions to set their password.`}</div>
  );
};

const PasswordSuccess = ({ user, temporaryPassword }) => (
  <div>
    <PasswordSuccessMessage>
      {jt`We couldn’t send them an email invitation, so make sure to tell them to log in using ${(
        <strong>{user.email}</strong>
      )} and this password we’ve generated for them:`}
    </PasswordSuccessMessage>

    <PasswordReveal password={temporaryPassword} />
    <div
      style={{ paddingLeft: "5em", paddingRight: "5em" }}
      className="pt4 text-centered"
    >
      {jt`If you want to be able to send email invites, just go to the ${(
        <Link to="/admin/settings/email" className="link text-bold">
          Email Settings
        </Link>
      )} page.`}
    </div>
  </div>
);

export default _.compose(
  User.load({
    id: (state, props) => props.params.userId,
  }),
  connect(
    (state, props) => ({
      temporaryPassword: getUserTemporaryPassword(state, {
        userId: props.params.userId,
      }),
    }),
    {
      onClose: () => push("/admin/people"),
      clearTemporaryPassword,
    },
  ),
)(UserSuccessModal);
