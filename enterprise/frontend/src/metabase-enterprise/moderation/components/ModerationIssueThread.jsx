import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "ttag";

import {
  getColor,
  getModerationStatusIcon,
} from "metabase-enterprise/moderation";
import { MODERATION_TEXT } from "metabase-enterprise/moderation/constants";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import Comment from "metabase/components/Comment";
import ModerationIssueActionMenu from "metabase-enterprise/moderation/components/ModerationIssueActionMenu";

ModerationIssueThread.propTypes = {
  className: PropTypes.string,
  issue: PropTypes.object.isRequired,
  onComment: PropTypes.func,
  onResolve: PropTypes.func,
};

const COMMMENT_VISIBLE_LINES = 3;

export function ModerationIssueThread({
  className,
  issue,
  onComment,
  onResolve,
}) {
  const color = getColor(issue.type);
  const icon = getModerationStatusIcon(issue.type);
  const hasButtonBar = !!(onComment || onResolve);

  return (
    <div className={cx(className, "")}>
      <div className={`flex align-center text-${color} text-bold`}>
        <Icon name={icon} className="mr1" />
        {MODERATION_TEXT.user[issue.type].action}
      </div>
      <Comment
        className="pt1"
        title={issue.title}
        text={issue.text}
        timestamp={issue.timestamp}
        visibleLines={COMMMENT_VISIBLE_LINES}
      />
      {issue.comments.map(comment => {
        return (
          <Comment
            className="pt2"
            key={comment.id}
            icon={comment.isModerator && "shield"}
            title={comment.title}
            text={comment.text}
            timestamp={comment.timestamp}
            visibleLines={COMMMENT_VISIBLE_LINES}
          />
        );
      })}
      {hasButtonBar && (
        <div className="flex justify-end column-gap-1 pt1">
          {onComment && (
            <Button className="py1" onClick={onComment}>{t`Comment`}</Button>
          )}
          {onResolve && (
            <ModerationIssueActionMenu
              triggerClassName="text-white text-white-hover bg-brand bg-brand-hover py1"
              onAction={onResolve}
              issue={issue}
            />
          )}
        </div>
      )}
    </div>
  );
}
