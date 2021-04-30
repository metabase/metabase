import React, { useState } from "react";
import PropTypes from "prop-types";
import { MODERATION_TEXT } from "metabase-enterprise/moderation/constants";
import {
  getModerationStatusIcon,
  getColor,
  getModerationStatus,
} from "metabase-enterprise/moderation";
import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";

CreateModerationIssuePanel.propTypes = {
  issueType: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  createModerationReview: PropTypes.func.isRequired,
  itemId: PropTypes.number.isRequired,
  itemType: PropTypes.string.isRequired,
};

function CreateModerationIssuePanel({
  issueType,
  onCancel,
  createModerationReview,
  itemId,
  itemType,
}) {
  const [description, setDescription] = useState("");
  const icon = getModerationStatusIcon(issueType);
  const color = getColor(issueType);

  const onCreateModerationReview = () => {
    createModerationReview({
      // TODO: I should redo the ACTIONS map to be keyed by statuses
      status: getModerationStatus(issueType),
      moderated_item_id: itemId,
      moderated_item_type: itemType,
    });
  };

  return (
    <div className="p2 flex flex-column row-gap-2">
      <div className="flex align-center">
        <Icon className="mr1" name={icon} size={18} />
        <span className={`text-${color} text-bold`}>
          {MODERATION_TEXT.moderator[issueType].action}
        </span>
      </div>
      <div>
        {MODERATION_TEXT.moderator[issueType].actionCreationDescription}
      </div>
      <label className="text-bold">
        {MODERATION_TEXT.moderator[issueType].actionCreationLabel}
      </label>
      <textarea
        className="input full max-w-full min-w-full"
        rows={10}
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder={MODERATION_TEXT.actionCreationPlaceholder}
      />
      <div className="flex column-gap-1 justify-end">
        <Button onClick={onCancel}>{MODERATION_TEXT.cancel}</Button>
        <Button primary>
          {MODERATION_TEXT.moderator[issueType].actionCreationButton}
        </Button>
      </div>
    </div>
  );
}

export default CreateModerationIssuePanel;
