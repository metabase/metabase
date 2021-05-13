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
  display: flex;
  align-items: start;
  justify-content: start;
  transform: translateX(-${props => props.leftShift}px);
  white-space: pre-line;
  width: 100%;
  margin-bottom: 1rem;
`;

// shift the border down slightly so that it doesn't appear above the top-most icon
// also using a negative `bottom` to connect the border with the event icon beneath it
const Border = styled.div`
  position: absolute;
  top: ${props => props.borderShift}px;
  left: ${props => props.borderShift}px;
  bottom: calc(-1rem - ${props => props.borderShift}px);
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
      {sortedFormattedItems.map((item, index) => {
        const { icon, title, description, formattedTimestamp } = item;
        const key = item.key == null ? index : item.key;
        const isNotLastEvent = index !== sortedFormattedItems.length - 1;

        return (
          <TimelineItem key={key} leftShift={halfIconSize}>
            {isNotLastEvent && <Border borderShift={halfIconSize} />}
            <Icon className="relative text-light" name={icon} size={iconSize} />
            <div className="ml1 flex-1">
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
