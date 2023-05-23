import React, { useMemo } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";
import { getRelativeTime } from "metabase/lib/time";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";

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
      title: PropTypes.node.isRequired,
      description: PropTypes.string,
      renderFooter: PropTypes.bool,
    }),
  ),
  renderFooter: PropTypes.func,
  revertFn: PropTypes.func,
  "data-testid": PropTypes.string,
};

function Timeline({
  className,
  items = [],
  renderFooter,
  revertFn,
  "data-testid": dataTestId,
}) {
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
      data-testid={dataTestId}
    >
      {sortedFormattedItems.map((item, index) => {
        const {
          icon,
          title,
          titleText,
          description,
          timestamp,
          formattedTimestamp,
          isRevertable,
          revision,
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
              <ItemHeader>
                {title}
                {isRevertable && revertFn && (
                  <Tooltip tooltip={t`Revert to this version`}>
                    <Button
                      icon="revert"
                      onlyIcon
                      borderless
                      onClick={() => revertFn(revision)}
                      data-testid="question-revert-button"
                      aria-label={t`revert to ${titleText}`}
                    />
                  </Tooltip>
                )}
              </ItemHeader>
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

export default Object.assign(Timeline, {
  ItemBody,
  ItemHeader,
  ItemIcon,
});
