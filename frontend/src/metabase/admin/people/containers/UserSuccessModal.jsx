import React from "react";
import { Box } from "grid-styled";
import { t, jt } from "ttag";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import User from "metabase/entities/users";
import { clearTemporaryPassword } from "../people";
import { getUserTemporaryPassword } from "../selectors";

import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import ModalContent from "metabase/components/ModalContent";
import PasswordReveal from "metabase/components/PasswordReveal";

@User.load({
  id: (state, props) => props.params.userId,
  wrapped: true,
})
@connect(
  (state, props) => ({
    temporaryPassword: getUserTemporaryPassword(state, {
      userId: props.params.userId,
    }),
  }),
  {
    onClose: () => push("/admin/people"),
    clearTemporaryPassword,
  },
)
export default class UserSuccessModal extends React.Component {
  componentWillUnmount() {
    this.props.clearTemporaryPassword(this.props.params.userId);
  }
  render() {
    const { onClose, user, temporaryPassword } = this.props;
    return (
      <ModalContent
        title={t`${user.getName()} has been added`}
        footer={<Button primary onClick={() => onClose()}>{t`Done`}</Button>}
        onClose={onClose}
      >
        {temporaryPassword ? (
          <PasswordSuccess user={user} temporaryPassword={temporaryPassword} />
        ) : (
          <EmailSuccess user={user} />
        )}
      </ModalContent>
    );
  }
}

const EmailSuccess = ({ user }) => (
  <Box>{jt`We’ve sent an invite to ${(
    <strong>{user.email}</strong>
  )} with instructions to set their password.`}</Box>
);

const PasswordSuccess = ({ user, temporaryPassword }) => (
  <Box>
    <Box pb={4}>
      {jt`We couldn’t send them an email invitation, so make sure to tell them to log in using ${(
        <strong>{user.email}</strong>
      )} and this password we’ve generated for them:`}
    </Box>

    <PasswordReveal password={temporaryPassword} />
    <Box
      style={{ paddingLeft: "5em", paddingRight: "5em" }}
      className="pt4 text-centered"
    >
      {jt`If you want to be able to send email invites, just go to the ${(
        <Link to="/admin/settings/email" className="link text-bold">
          Email Settings
        </Link>
      )} page.`}
    </Box>
  </Box>
);
