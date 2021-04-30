import React from "react";
import PropTypes from "prop-types";

import ClampedText from "metabase/components/ClampedText";
import CommentHeader from "metabase/components/CommentHeader";

function Comment({
  className,
  title,
  timestamp,
  text,
  visibleLines,
  actions = [],
}) {
  return (
    <div className={className} role="comment">
      <CommentHeader title={title} timestamp={timestamp} actions={actions} />
      <ClampedText text={text} visibleLines={visibleLines} />
    </div>
  );
}

Comment.propTypes = {
  className: PropTypes.string,
  title: PropTypes.node,
  timestamp: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.instanceOf(Date),
  ]),
  text: PropTypes.string,
  visibleLines: PropTypes.number,
  actions: PropTypes.instanceOf(Array),
};

export default Comment;
