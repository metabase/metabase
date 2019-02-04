import React from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import { t } from "c-3po";
import { Flex } from "grid-styled";

import Users from "metabase/entities/users";

import MetabaseSettings from "metabase/lib/settings";

import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";

import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";

const UserPasswordResetModal = ({
  emailConfigured,
  goBack,
  object,
  onPasswordReset,
}) => (
  <ModalContent
    title={t`Reset ${object.getName()}'s password?`}
    onClose={goBack}
  >
    <p>{t`Are you sure you want to do this?`}</p>

    <Flex>
      <Button
        ml="auto"
        onClick={() => onPasswordReset(object) && goBack()}
        danger
      >{t`Reset password`}</Button>
    </Flex>
  </ModalContent>
);

export default connect(
  (state, props) => ({
    emailConfigured: MetabaseSettings.isEmailConfigured(),
  }),
  {
    goBack,
    onPasswordReset: Users.actions.passwordResetEmail,
  },
)(
  entityObjectLoader({
    entityType: "users",
    entityId: (state, props) => props.params.userId,
    wrapped: true,
  })(UserPasswordResetModal),
);
