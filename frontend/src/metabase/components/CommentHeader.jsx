import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import styled from "styled-components";

import { getRelativeTime } from "metabase/lib/time";

import EntityMenu from "metabase/components/EntityMenu";
import Icon from "metabase/components/Icon";

const StyledIcon = styled(Icon)`
  padding-right: 0.25rem;
`;

const TRIGGER_BUTTON_DIAMETER = "25px";
const TRIGGER_PROPS = {
  className: "text-light",
  style: {
    height: TRIGGER_BUTTON_DIAMETER,
    width: TRIGGER_BUTTON_DIAMETER,
  },
};

CommentHeader.propTypes = {
  className: PropTypes.string,
  icon: PropTypes.string,
  title: PropTypes.node,
  timestamp: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.instanceOf(Date),
  ]),
  actions: PropTypes.instanceOf(Array),
};

function CommentHeader({ className, icon, title, timestamp, actions = [] }) {
  const relativeTimestamp = timestamp ? getRelativeTime(timestamp) : "";
  return (
    <div className={cx("flex justify-between align-center", className)}>
      <div className="flex align-center">
        {icon && <StyledIcon name={icon} />}
        <span className="text-bold">{title}</span>
        {timestamp && (
          <time className="pl1 text-light" dateTime={timestamp}>
            {relativeTimestamp}
          </time>
        )}
      </div>
      {actions.length ? (
        <EntityMenu
          triggerIcon="ellipsis"
          items={actions}
          triggerProps={TRIGGER_PROPS}
        />
      ) : (
        undefined
      )}
    </div>
  );
}

export default CommentHeader;
