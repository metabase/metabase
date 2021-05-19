import React, { useState } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import { useAsyncFunction } from "metabase/lib/hooks";
import { MODERATION_TEXT } from "metabase-enterprise/moderation/constants";
import {
  getModerationStatusIcon,
  getColor,
} from "metabase-enterprise/moderation";
import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";

CreateModerationIssuePanel.propTypes = {
  issueType: PropTypes.string.isRequired,
  onReturn: PropTypes.func.isRequired,
  createModerationReview: PropTypes.func.isRequired,
  createModerationRequest: PropTypes.func.isRequired,
  itemId: PropTypes.number.isRequired,
  isAdmin: PropTypes.bool.isRequired,
  moderationRequest: PropTypes.object,
};

function CreateModerationIssuePanel({
  issueType,
  onReturn,
  createModerationReview: _createModerationReview,
  createModerationRequest: _createModerationRequest,
  itemId,
  isAdmin,
  moderationRequest,
}) {
  const [description, setDescription] = useState("");
  const icon = getModerationStatusIcon(issueType);
  const color = getColor(issueType);
  const textColorClass = `text-${color}`;
  const userType = isAdmin ? "moderator" : "user";

  const [createModerationReview, isModerationReviewPending] = useAsyncFunction(
    _createModerationReview,
  );
  const [
    createModerationRequest,
    isModerationRequestPending,
  ] = useAsyncFunction(_createModerationRequest);

  const isPending = isModerationRequestPending || isModerationReviewPending;

  const onCreateModerationReview = async e => {
    e.preventDefault();

    if (isAdmin) {
      await createModerationReview({
        moderationReview: {
          type: issueType,
          cardId: itemId,
          description,
        },
        moderationRequest,
      });
    } else {
      await createModerationRequest({});
    }

    // this fn gets much more complex
    // if no moderationRequest, create moderation review
    // if moderationRequest, create moderation review and resolve request
    // if type is dismiss, create comment and close it
    // should not encounter a type of dismiss without a moderationRequest

    onReturn();
  };

  return (
    <form
      onSubmit={onCreateModerationReview}
      className="p2 flex flex-column row-gap-2"
    >
      <div className={cx(textColorClass, "flex align-center")}>
        <Icon className="mr1" name={icon} size={18} />
        <span className="text-bold">
          {MODERATION_TEXT[userType][issueType].action}
        </span>
      </div>
      <div>
        {MODERATION_TEXT[userType][issueType].actionCreationDescription}
      </div>
      <label className="text-bold">
        {MODERATION_TEXT[userType][issueType].actionCreationLabel}
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
          {MODERATION_TEXT.cancel}
        </Button>
        <Button disabled={isPending} type="submit" primary>
          {MODERATION_TEXT[userType][issueType].actionCreationButton}
        </Button>
      </div>
    </form>
  );
}

export default CreateModerationIssuePanel;
