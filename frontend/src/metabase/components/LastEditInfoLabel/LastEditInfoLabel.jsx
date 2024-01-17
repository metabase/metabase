import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";

import { getUser } from "metabase/selectors/user";
import { getFullName } from "metabase/lib/user";
import { TextButton } from "metabase/components/Button.styled";
import Tooltip from "metabase/core/components/Tooltip";
import DateTime from "metabase/components/DateTime";

function mapStateToProps(state) {
  return {
    user: getUser(state),
  };
}

LastEditInfoLabel.propTypes = {
  item: PropTypes.shape({
    "last-edit-info": PropTypes.shape({
      id: PropTypes.number,
      email: PropTypes.string,
      first_name: PropTypes.string,
      last_name: PropTypes.string,
      timestamp: PropTypes.string,
    }).isRequired,
  }),
  prefix: PropTypes.string,
  user: PropTypes.shape({
    id: PropTypes.number,
  }).isRequired,
  onClick: PropTypes.func,
  className: PropTypes.string,
};

function formatEditorName(lastEditInfo) {
  const name = getFullName(lastEditInfo);

  return name || lastEditInfo.email;
}

function LastEditInfoLabel({
  item,
  user,
  prefix = t`Edited`,
  onClick,
  className,
}) {
  const lastEditInfo = item["last-edit-info"];
  const { id: editorId, timestamp } = lastEditInfo;

  const momentTimestamp = moment(timestamp);
  const timeLabel =
    timestamp && momentTimestamp.isValid() ? momentTimestamp.fromNow() : null;

  const editor = editorId === user.id ? t`you` : formatEditorName(lastEditInfo);
  const editorLabel = editor ? t`by ${editor}` : null;

  const label =
    timeLabel || editorLabel
      ? [timeLabel, editorLabel].filter(Boolean).join(" ")
      : null;

  return label ? (
    <Tooltip
      tooltip={timestamp ? <DateTime value={timestamp} /> : null}
      isEnabled={!!timeLabel}
    >
      <TextButton
        size="small"
        className={className}
        onClick={onClick}
        data-testid="revision-history-button"
      >
        {prefix} {label}
      </TextButton>
    </Tooltip>
  ) : null;
}

export default connect(mapStateToProps)(LastEditInfoLabel);
