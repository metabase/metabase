import React, { useState } from "react";
import PropTypes from "prop-types";

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
  itemId: PropTypes.number.isRequired,
  itemType: PropTypes.string.isRequired,
};

function CreateModerationIssuePanel({
  issueType,
  onReturn,
  createModerationReview: _createModerationReview,
  itemId,
  itemType,
}) {
  const [description, setDescription] = useState("");
  const icon = getModerationStatusIcon(issueType);
  const color = getColor(issueType);

  const [createModerationReview, isPending] = useAsyncFunction(
    _createModerationReview,
  );

  const onCreateModerationReview = async e => {
    e.preventDefault();

    await createModerationReview({
      status: issueType,
      moderated_item_id: itemId,
      moderated_item_type: itemType,
    });

    onReturn();
  };

  return (
    <form
      onSubmit={onCreateModerationReview}
      className="p2 flex flex-column row-gap-2"
    >
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
        name="text"
      />
      <div className="flex column-gap-1 justify-end">
        <Button disabled={isPending} type="button" onClick={onReturn}>
          {MODERATION_TEXT.cancel}
        </Button>
        <Button disabled={isPending} type="submit" primary>
          {MODERATION_TEXT.moderator[issueType].actionCreationButton}
        </Button>
      </div>
    </form>
  );
}

export default CreateModerationIssuePanel;
