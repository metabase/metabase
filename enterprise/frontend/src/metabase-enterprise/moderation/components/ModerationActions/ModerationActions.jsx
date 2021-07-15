import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";

import { getIsModerator } from "metabase-enterprise/moderation/selectors";
import { isItemVerified } from "metabase-enterprise/moderation/service";

import { Container, Label, VerifyButton } from "./ModerationActions.styled";
import Tooltip from "metabase/components/Tooltip";

const mapStateToProps = (state, props) => ({
  isModerator: getIsModerator(state, props),
});

export default connect(mapStateToProps)(ModerationActions);

ModerationActions.propTypes = {
  className: PropTypes.string,
  onVerify: PropTypes.func.isRequired,
  isModerator: PropTypes.bool.isRequired,
  moderationReview: PropTypes.object,
};

export function ModerationActions({
  moderationReview,
  className,
  onVerify,
  isModerator,
}) {
  return isModerator ? (
    <Container className={className}>
      <Label>{t`Moderation`}</Label>
      <Tooltip tooltip={t`Verify this`}>
        <VerifyButton
          data-testid="moderation-verify-action"
          onClick={onVerify}
          disabled={isItemVerified(moderationReview)}
        />
      </Tooltip>
    </Container>
  ) : null;
}
