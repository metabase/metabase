import React from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import { t } from "ttag";
import { Flex } from "grid-styled";

import User from "metabase/entities/users";
import { clearTemporaryPassword } from "../people";
import { getUserTemporaryPassword } from "../selectors";

import MetabaseSettings from "metabase/lib/settings";

import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";
import PasswordReveal from "metabase/components/PasswordReveal";

@User.load({
  id: (state, props) => props.params.userId,
  wrapped: true,
})
@connect(
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
)
export default class UserPasswordResetModal extends React.Component {
  componentWillUnmount() {
    this.props.clearTemporaryPassword(this.props.params.userId);
  }
  render() {
    const { user, emailConfigured, temporaryPassword, onClose } = this.props;
    return temporaryPassword ? (
      <ModalContent
        title={t`${user.first_name}'s password has been reset`}
        footer={<Button primary onClick={onClose}>{t`Done`}</Button>}
        onClose={onClose}
      >
        <span className="pb3 block">{t`Here’s a temporary password they can use to log in and then change their password.`}</span>

        <PasswordReveal password={temporaryPassword} />
      </ModalContent>
    ) : (
      <ModalContent
        title={t`Reset ${user.getName()}'s password?`}
        onClose={onClose}
      >
        <p>{t`Are you sure you want to do this?`}</p>

        <Flex>
          <Button
            ml="auto"
            onClick={async () => {
              if (emailConfigured) {
                await user.passwordResetEmail();
                onClose();
              } else {
                await user.passwordResetManual();
              }
            }}
            danger
          >
            {t`Reset password`}
          </Button>
        </Flex>
      </ModalContent>
    );
  }
}
