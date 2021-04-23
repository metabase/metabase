import React, { useMemo } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import styled from "styled-components";
import moment from "moment";

import { color } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

const TimelineContainer = styled.div`
  position: relative;
  margin-left: ${props => props.leftShift}px;
  margin-bottom: ${props => props.bottomShift}px;
`;

const TimelineItem = styled.div`
  transform: translateX(-${props => props.leftShift}px);
  white-space: pre-line;
`;

// shift the border down slightly so that it doesn't appear above the top-most icon
const Border = styled.div`
  position: absolute;
  top: ${props => props.borderShift}px;
  left: 0;
  right: 0;
  bottom: -${props => props.borderShift}px;
  border-left: 1px solid ${color("border")};
`;

const Timeline = ({ className, items = [], renderFooter }) => {
  const iconSize = 20;
  const halfIconSize = iconSize / 2;

  const sortedFormattedItems = useMemo(() => {
    return items
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(item => {
        return {
          ...item,
          formattedTimestamp: moment(item.timestamp).fromNow(),
        };
      });
  }, [items]);

  return (
    <TimelineContainer
      leftShift={halfIconSize}
      bottomShift={halfIconSize}
      className={className}
    >
      <Border borderShift={halfIconSize} />
      {sortedFormattedItems.map((item, index) => {
        const { icon, title, description, formattedTimestamp } = item;
        const key = item.key == null ? index : item.key;

        return (
          <TimelineItem
            key={key}
            leftShift={halfIconSize}
            className="flex align-start justify-start mb2"
          >
            <Icon className="text-light" name={icon} size={iconSize} />
            <div className="ml1">
              <div className="text-bold">{title}</div>
              <div className="text-medium text-small">{formattedTimestamp}</div>
              <div>{description}</div>
              {_.isFunction(renderFooter) && <div>{renderFooter(item)}</div>}
            </div>
          </TimelineItem>
        );
      })}
    </TimelineContainer>
  );
};

Timeline.propTypes = {
  className: PropTypes.string,
  items: PropTypes.array,
  renderFooter: PropTypes.func,
};

export default Timeline;
