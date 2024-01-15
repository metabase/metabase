import PropTypes from "prop-types";
import type { MouseEventHandler } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";

import { getUser } from "metabase/selectors/user";
import type { NamedUser } from "metabase/lib/user";
import { getFullName } from "metabase/lib/user";
import { TextButton } from "metabase/components/Button.styled";
import { Tooltip } from "metabase/ui";
import DateTime from "metabase/components/DateTime";
import type { CollectionItem, User } from "metabase-types/api";

function mapStateToProps(state: any, props: any) {
  return {
    ...props,
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

function formatEditorName(lastEditInfo: NamedUser) {
  const name = getFullName(lastEditInfo);

  return name || lastEditInfo.email;
}

export type CollectionItemWithLastEditedInfo = CollectionItem & {
  "last-edit-info": {
    id?: number;
    timestamp: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
  };
};

// TODO: Should there be a fallback to a string like 'Edited 3 months ago' when there's no editor name?
const defaultLabelFormatter = (
  nameOfLastEditor: string | undefined,
  howLongAgo: string | undefined = "",
) => (
  <>
    {nameOfLastEditor ? t`Edited ${howLongAgo} by ${nameOfLastEditor}` : null}
  </>
);

// TODO: Maybe we can reuse the LastEditInfoLabel component as is without adding the separator; ask Kyle about this

function LastEditInfoLabel({
  item,
  user,
  onClick,
  className,
  fullName = null,
  formatLabel = defaultLabelFormatter,
}: {
  item: CollectionItemWithLastEditedInfo;
  user: User;
  onClick: MouseEventHandler<HTMLButtonElement>;
  className: string;
  fullName: string | null;
  formatLabel: (
    fullNameOfPersonWhoLastEditedThisItem: string | undefined,
    amountOfTimeAgo: string | undefined,
  ) => JSX.Element;
}) {
  const lastEditInfo = item["last-edit-info"];
  const editorId = lastEditInfo?.id;
  const timestamp = lastEditInfo?.timestamp;

  // TODO: use dayjs not moment
  // Not sure how to localize this. Bracket this for now, says Ryan
  const momentTimestamp = moment(timestamp);
  const timeLabel =
    timestamp && momentTimestamp.isValid()
      ? momentTimestamp.fromNow()
      : undefined;

  // TODO: Handle different capitalization of 'you' when name comes first
  const editorFullName =
    editorId === user.id ? t`you` : fullName || formatEditorName(lastEditInfo);
  const label = formatLabel(editorFullName, timeLabel);

  return label ? (
    <Tooltip
      label={timestamp ? <DateTime value={timestamp} /> : null}
      disabled={!timeLabel}
    >
      <TextButton
        size="small"
        className={className}
        onClick={onClick}
        data-testid="revision-history-button"
      >
        {label}
      </TextButton>
    </Tooltip>
  ) : null;
}
// TODO: Make the tooltip look like the one on Figma (bottom left corner)
// NOTE: The header is meant to be truncated and ellipsified too
// NOTE: Verification of a question is an enterprise feature. Enterprise features are loaded through plugins.

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(LastEditInfoLabel);
