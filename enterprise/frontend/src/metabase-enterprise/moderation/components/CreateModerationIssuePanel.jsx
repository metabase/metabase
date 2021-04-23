import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import {
  getModerationStatusIcon,
  getColor,
  MODERATION_TEXT,
} from "metabase/lib/moderation";
import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";

function CreateModerationIssuePanel({ issueType, onCancel }) {
  const [description, setDescription] = useState("");
  const icon = getModerationStatusIcon(issueType);
  const color = getColor(issueType);

  return (
    <div className="p2 flex flex-column row-gap-2">
      <div className="py1 flex align-center">
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
        className="input full"
        rows={10}
        value={description}
        onChange={setDescription}
      />
      <div className="flex column-gap-1 justify-end">
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button primary>
          {MODERATION_TEXT.moderator[issueType].actionCreationButton}
        </Button>
      </div>
    </div>
  );
}

CreateModerationIssuePanel.propTypes = {
  issueType: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default CreateModerationIssuePanel;
