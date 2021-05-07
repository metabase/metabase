import React from "react";
import PropTypes from "prop-types";
import styled from "styled-components";

import ClampedText from "metabase/components/ClampedText";
import CommentHeader from "metabase/components/CommentHeader";

const StyledClampedText = styled(ClampedText)`
  padding-top: 0.25rem;
`;

Comment.propTypes = {
  className: PropTypes.string,
  icon: PropTypes.string,
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

function Comment({
  className,
  icon,
  title,
  timestamp,
  text,
  visibleLines,
  actions = [],
}) {
  return (
    <div className={className} role="comment">
      <CommentHeader
        icon={icon}
        title={title}
        timestamp={timestamp}
        actions={actions}
      />
      <StyledClampedText text={text} visibleLines={visibleLines} />
    </div>
  );
}

export default Comment;
