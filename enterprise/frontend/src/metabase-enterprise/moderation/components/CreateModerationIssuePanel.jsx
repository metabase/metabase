import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { useAsyncFunction } from "metabase/lib/hooks";
import { MODERATION_TEXT } from "metabase-enterprise/moderation/constants";
import {
  isRequestType,
  isReviewType,
  isRequestDismissal,
} from "metabase-enterprise/moderation";

import Button from "metabase/components/Button";
import ModerationIssuePill from "metabase-enterprise/moderation/components/ModerationIssuePill";

CreateModerationIssuePanel.propTypes = {
  issueType: PropTypes.string.isRequired,
  onReturn: PropTypes.func.isRequired,
  createModerationReview: PropTypes.func.isRequired,
  createModerationRequest: PropTypes.func.isRequired,
  dismissModerationRequest: PropTypes.func.isRequired,
  itemId: PropTypes.number.isRequired,
  isModerator: PropTypes.bool.isRequired,
  moderationRequest: PropTypes.object,
};

function CreateModerationIssuePanel({
  issueType,
  onReturn,
  createModerationReview: _createModerationReview,
  createModerationRequest: _createModerationRequest,
  dismissModerationRequest: _dismissModerationRequest,
  itemId,
  isModerator,
  moderationRequest,
}) {
  const [description, setDescription] = useState("");

  const [createModerationReview, isModerationReviewPending] = useAsyncFunction(
    _createModerationReview,
  );
  const [
    createModerationRequest,
    isModerationRequestPending,
  ] = useAsyncFunction(_createModerationRequest);
  const [
    dismissModerationRequest,
    isRequestDismissalPending,
  ] = useAsyncFunction(_dismissModerationRequest);

  const isPending =
    isModerationRequestPending ||
    isModerationReviewPending ||
    isRequestDismissalPending;

  const onCreateModerationIssue = async e => {
    e.preventDefault();
    if (isRequestType(issueType)) {
      await createModerationRequest({
        type: issueType,
        cardId: itemId,
        description,
      });
    } else if (isReviewType(issueType)) {
      await createModerationReview({
        moderationReview: {
          type: issueType,
          cardId: itemId,
          description,
        },
        moderationRequest,
      });
    } else if (isRequestDismissal(issueType)) {
      await dismissModerationRequest({
        description,
        moderationRequest,
      });
    }

    onReturn();
  };

  return (
    <form
      onSubmit={onCreateModerationIssue}
      className="p2 flex flex-column row-gap-2"
    >
      <ModerationIssuePill type={issueType} />
      <div>{MODERATION_TEXT[issueType].actionCreationDescription}</div>
      <label className="text-bold">
        {MODERATION_TEXT[issueType].actionCreationLabel}
      </label>
      <textarea
        className="input full max-w-full min-w-full"
        rows={10}
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder={MODERATION_TEXT.actionCreationPlaceholder}
        name="text"
      />
      <div className="flex column-gap-1 justify-end">
        <Button disabled={isPending} type="button" onClick={onReturn}>
          {t`Cancel`}
        </Button>
        <Button disabled={isPending} type="submit" primary>
          {MODERATION_TEXT[issueType].actionCreationButton}
        </Button>
      </div>
    </form>
  );
}

export default CreateModerationIssuePanel;
