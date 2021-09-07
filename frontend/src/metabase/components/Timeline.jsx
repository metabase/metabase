import React, { useMemo } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { getRelativeTime } from "metabase/lib/time";

import {
  TimelineContainer,
  TimelineItem,
  Border,
  ItemIcon,
  ItemBody,
  ItemHeader,
  Timestamp,
  ItemFooter,
} from "./Timeline.styled";

Timeline.propTypes = {
  className: PropTypes.string,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      timestamp: PropTypes.number.isRequired,
      icon: PropTypes.oneOfType([PropTypes.string, PropTypes.object])
        .isRequired,
      title: PropTypes.string.isRequired,
      description: PropTypes.string,
      renderFooter: PropTypes.bool,
    }),
  ),
  renderFooter: PropTypes.func,
};

export default Timeline;

function Timeline({ className, items = [], renderFooter }) {
  const iconSize = 16;
  const halfIconSize = iconSize / 2;

  const sortedFormattedItems = useMemo(() => {
    return items
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(item => {
        return {
          ...item,
          formattedTimestamp: getRelativeTime(item.timestamp),
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
        const {
          icon,
          title,
          description,
          timestamp,
          formattedTimestamp,
        } = item;
        const key = item.key == null ? index : item.key;
        const isNotLastEvent = index !== sortedFormattedItems.length - 1;
        const iconProps = _.isObject(icon)
          ? icon
          : {
              name: icon,
            };

        return (
          <TimelineItem key={key} leftShift={halfIconSize}>
            {isNotLastEvent && <Border borderShift={halfIconSize} />}
            <ItemIcon {...iconProps} size={iconSize} />
            <ItemBody>
              <ItemHeader>{title}</ItemHeader>
              <Timestamp datetime={timestamp}>{formattedTimestamp}</Timestamp>
              <div>{description}</div>
              {_.isFunction(renderFooter) && (
                <ItemFooter>{renderFooter(item)}</ItemFooter>
              )}
            </ItemBody>
          </TimelineItem>
        );
      })}
    </TimelineContainer>
  );
}
