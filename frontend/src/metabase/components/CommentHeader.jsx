import React from "react";
import PropTypes from "prop-types";
import moment from "moment";
import cx from "classnames";
import EntityMenu from "metabase/components/EntityMenu";

const TRIGGER_BUTTON_DIAMETER = "25px";
const TRIGGER_PROPS = {
  className: "text-light",
  style: {
    height: TRIGGER_BUTTON_DIAMETER,
    width: TRIGGER_BUTTON_DIAMETER,
  },
};

function CommentHeader({ className, title, timestamp, actions = [] }) {
  const relativeTimestamp = timestamp ? moment(timestamp).fromNow() : "";
  return (
    <div className={cx("flex justify-between align-center", className)}>
      <div>
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

CommentHeader.propTypes = {
  className: PropTypes.string,
  title: PropTypes.node,
  timestamp: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.instanceOf(Date),
  ]),
  actions: PropTypes.instanceOf(Array),
};

export default CommentHeader;
