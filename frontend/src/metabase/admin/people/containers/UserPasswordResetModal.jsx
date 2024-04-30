/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import ModalContent from "metabase/components/ModalContent";
import PasswordReveal from "metabase/components/PasswordReveal";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import Users from "metabase/entities/users";
import MetabaseSettings from "metabase/lib/settings";

import { clearTemporaryPassword } from "../people";
import { getUserTemporaryPassword } from "../selectors";

import { ButtonContainer } from "./UserPasswordResetModal.styled";

class UserPasswordResetModal extends Component {
  state = {
    resetButtonDisabled: false,
  };

  componentWillUnmount() {
    this.props.clearTemporaryPassword(this.props.params.userId);
  }

  handleClose = () => {
    this.setState({ resetButtonDisabled: false });
    this.props.onClose();
  };

  render() {
    const { user, emailConfigured, temporaryPassword } = this.props;
    return temporaryPassword ? (
      <ModalContent
        title={t`${user.common_name}'s password has been reset`}
        footer={<Button primary onClick={this.handleClose}>{t`Done`}</Button>}
        onClose={this.handleClose}
      >
        <span
          className={cx(CS.pb3, CS.block)}
        >{t`Here’s a temporary password they can use to log in and then change their password.`}</span>

        <PasswordReveal password={temporaryPassword} />
      </ModalContent>
    ) : (
      <ModalContent
        title={t`Reset ${user.common_name}'s password?`}
        onClose={this.handleClose}
      >
        <p>{t`Are you sure you want to do this?`}</p>

        <ButtonContainer>
          <Button
            className={CS.mlAuto}
            disabled={this.state.resetButtonDisabled}
            onClick={async () => {
              this.setState({ resetButtonDisabled: true });
              if (emailConfigured) {
                await user.resetPasswordEmail();
                this.handleClose();
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
  Users.load({
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
