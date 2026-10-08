import cx from "classnames";
import type { ChangeEvent, SyntheticEvent } from "react";
import { memo, useCallback } from "react";
import { t } from "ttag";

import { TimelineEventInfo } from "metabase/common/components/TimelineEventInfo";
import { useScrollOnMount } from "metabase/common/hooks/use-scroll-on-mount";
import CS from "metabase/css/core/index.css";
import { ActionIcon, Box, Checkbox, Flex, Icon, Menu } from "metabase/ui";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import S from "./EventCard.module.css";

export interface EventCardProps {
  event: TimelineEvent;
  timeline: Timeline;
  isSelected?: boolean;
  isVisible: boolean;
  onEdit?: (event: TimelineEvent) => void;
  onMove?: (event: TimelineEvent) => void;
  onArchive?: (event: TimelineEvent) => void;
  onToggleSelected?: (event: TimelineEvent, isSelected: boolean) => void;
  onShowTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onHideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
}

const EventCardInner = ({
  event,
  timeline,
  isSelected,
  isVisible,
  onEdit,
  onMove,
  onArchive,
  onToggleSelected,
  onShowTimelineEvents,
  onHideTimelineEvents,
}: EventCardProps): JSX.Element => {
  const selectedRef = useScrollOnMount<HTMLDivElement>();
  const menuItems = getMenuItems(event, timeline, onEdit, onMove, onArchive);

  const handleToggleSelected = useCallback(() => {
    if (isVisible) {
      onToggleSelected?.(event, !isSelected);
    }
  }, [event, isVisible, isSelected, onToggleSelected]);

  const handleChangeVisibility = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
        onShowTimelineEvents([event]);
      } else {
        onHideTimelineEvents([event]);
      }
    },
    [event, onShowTimelineEvents, onHideTimelineEvents],
  );

  const handleAsideClick = useCallback((event: SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <Flex
      className={cx(S.root, { [S.selected]: isVisible && isSelected })}
      py="xxs"
      px="md"
      aria-label={t`Timeline event card`}
      ref={isSelected ? selectedRef : null}
      onClick={handleToggleSelected}
    >
      <Flex flex="0 0 auto" justify="center" align="center" w="2rem" h="2rem">
        <Checkbox
          checked={isVisible}
          onChange={handleChangeVisibility}
          onClick={handleAsideClick}
        />
      </Flex>
      <Box flex="1 1 auto" pt="xxxs" pr="md" pl="xxxs" miw={0}>
        <TimelineEventInfo event={event} />
      </Box>
      {menuItems.length > 0 && (
        <Box
          className={CS.alignSelfStart}
          flex="0 0 auto"
          onClick={handleAsideClick}
        >
          <Menu position="bottom-end" shadow="sm">
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label={t`Event menu`}>
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>{menuItems}</Menu.Dropdown>
          </Menu>
        </Box>
      )}
    </Flex>
  );
};

const getMenuItems = (
  event: TimelineEvent,
  timeline: Timeline,
  onEdit?: (event: TimelineEvent) => void,
  onMove?: (event: TimelineEvent) => void,
  onArchive?: (event: TimelineEvent) => void,
) => {
  if (!timeline.collection?.can_write) {
    return [];
  }

  const items = [];
  if (onEdit) {
    items.push(
      <Menu.Item key="edit-event" onClick={() => onEdit(event)}>
        {t`Edit event`}
      </Menu.Item>,
    );
  }
  if (onMove) {
    items.push(
      <Menu.Item key="move-event" onClick={() => onMove(event)}>
        {t`Move event`}
      </Menu.Item>,
    );
  }
  if (onArchive) {
    items.push(
      <Menu.Item key="archive-event" onClick={() => onArchive(event)}>
        {t`Archive event`}
      </Menu.Item>,
    );
  }
  return items;
};

export const EventCard = memo(EventCardInner);
