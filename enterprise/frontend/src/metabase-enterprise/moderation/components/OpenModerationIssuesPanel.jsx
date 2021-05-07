import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { getOpenIssues } from "metabase-enterprise/moderation";
import Button from "metabase/components/Button";
import { ModerationIssueThread } from "metabase-enterprise/moderation/components/ModerationIssueThread";

OpenModerationIssuesPanel.propTypes = {
  onReturn: PropTypes.func.isRequired,
};

export function OpenModerationIssuesPanel({ onReturn }) {
  const issues = getOpenIssues();
  return (
    <div className="px1">
      <div className="pt1">
        <Button
          className="text-brand text-brand-hover"
          borderless
          icon="chevronleft"
          onClick={onReturn}
        >{t`Open issues`}</Button>
      </div>
      <div className="px2">
        {issues.map(issue => {
          return (
            <ModerationIssueThread
              key={issue.id}
              className="py2 border-row-divider"
              issue={issue}
              onComment={() => {}}
              onResolve={() => {}}
            />
          );
        })}
      </div>
    </div>
  );
}
