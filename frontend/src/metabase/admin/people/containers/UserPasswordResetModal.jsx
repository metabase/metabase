/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import User from "metabase/entities/users";

import MetabaseSettings from "metabase/lib/settings";

import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";
import PasswordReveal from "metabase/components/PasswordReveal";
import { getUserTemporaryPassword } from "../selectors";
import { clearTemporaryPassword } from "../people";
import { ButtonContainer } from "./UserPasswordResetModal.styled";

class UserPasswordResetModal extends Component {
  componentWillUnmount() {
    this.props.clearTemporaryPassword(this.props.params.userId);
  }
  render() {
    const { user, emailConfigured, temporaryPassword, onClose } = this.props;
    return temporaryPassword ? (
      <ModalContent
        title={t`${user.common_name}'s password has been reset`}
        footer={<Button primary onClick={onClose}>{t`Done`}</Button>}
        onClose={onClose}
      >
        <span className="pb3 block">{t`Here’s a temporary password they can use to log in and then change their password.`}</span>

        <PasswordReveal password={temporaryPassword} />
      </ModalContent>
    ) : (
      <ModalContent
        title={t`Reset ${user.common_name}'s password?`}
        onClose={onClose}
      >
        <p>{t`Are you sure you want to do this?`}</p>

        <ButtonContainer>
          <Button
            ml="auto"
            onClick={async () => {
              if (emailConfigured) {
                await user.resetPasswordEmail();
                onClose();
              } else {
                await user.resetPasswordManual();
              }
            }}
            danger
          >
            {t`Reset password`}
          </Button>
        </ButtonContainer>
      </ModalContent>
    );
  }
}

export default _.compose(
  User.load({
    id: (state, props) => props.params.userId,
    wrapped: true,
  }),
  connect(
    (state, props) => ({
      emailConfigured: MetabaseSettings.isEmailConfigured(),
      temporaryPassword: getUserTemporaryPassword(state, {
        userId: props.params.userId,
      }),
    }),
    {
      onClose: goBack,
      clearTemporaryPassword,
    },
  ),
)(UserPasswordResetModal);
