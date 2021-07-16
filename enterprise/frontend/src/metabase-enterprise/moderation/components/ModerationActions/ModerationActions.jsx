import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { isItemVerified } from "metabase-enterprise/moderation/service";

import { Container, Label, VerifyButton } from "./ModerationActions.styled";
import Tooltip from "metabase/components/Tooltip";

export default ModerationActions;

ModerationActions.propTypes = {
  className: PropTypes.string,
  onVerify: PropTypes.func,
  moderationReview: PropTypes.object,
};

function ModerationActions({ moderationReview, className, onVerify }) {
  const hasActions = !!onVerify;
  const isVerified = isItemVerified(moderationReview);

  return hasActions ? (
    <Container className={className}>
      <Label>{t`Moderation`}</Label>
      <Tooltip isEnabled={!isVerified} tooltip={t`Verify this`}>
        <VerifyButton
          data-testid="moderation-verify-action"
          onClick={onVerify}
          disabled={isVerified}
        />
      </Tooltip>
    </Container>
  ) : null;
}
