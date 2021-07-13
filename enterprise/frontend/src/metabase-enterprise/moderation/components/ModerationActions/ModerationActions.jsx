import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { Container, Label, VerifyButton } from "./ModerationActions.styled";
import Tooltip from "metabase/components/Tooltip";

export default ModerationActions;

ModerationActions.propTypes = {
  className: PropTypes.string,
  onVerify: PropTypes.func.isRequired,
};

function ModerationActions({ className, onVerify }) {
  return (
    <Container className={className}>
      <Label>{t`Moderation`}</Label>
      <Tooltip tooltip={t`Verify this`}>
        <VerifyButton
          data-testid="moderation-verify-action"
          onClick={onVerify}
        />
      </Tooltip>
    </Container>
  );
}
