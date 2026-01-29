import type { ChangeEvent, SyntheticEvent } from "react";
import { memo, useCallback } from "react";
import { t } from "ttag";

import { CheckBox as Checkbox } from "metabase/common/components/CheckBox/CheckBox";
import { EntityMenu } from "metabase/common/components/EntityMenu";
import { useScrollOnMount } from "metabase/common/hooks/use-scroll-on-mount";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import Settings from "metabase/lib/settings";
import type { IconName } from "metabase/ui";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import {
  CardAside,
  CardBody,
  CardCheckboxContainer,
  CardCreatorInfo,
  CardDateInfo,
  CardDescription,
  CardIcon,
  CardIconAndDateContainer,
  CardRoot,
  CardTitle,
} from "./EventCard.styled";

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

const EventCard = ({
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
  const selectedRef = useScrollOnMount();
  const menuItems = getMenuItems(event, timeline, onEdit, onMove, onArchive);
  const dateMessage = getDateMessage(event);
  const creatorMessage = getCreatorMessage(event);

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
    <CardRoot
      aria-label={t`Timeline event card`}
      ref={isSelected ? selectedRef : null}
      isSelected={isVisible && isSelected}
      onClick={handleToggleSelected}
    >
      <CardCheckboxContainer>
        <Checkbox
          checked={isVisible}
          onChange={handleChangeVisibility}
          onClick={handleAsideClick}
        />
      </CardCheckboxContainer>
      <CardBody>
        <CardIconAndDateContainer>
          <CardIcon name={event.icon as unknown as IconName} />
          <CardDateInfo>{dateMessage}</CardDateInfo>
        </CardIconAndDateContainer>
        <CardTitle>{event.name}</CardTitle>
        {event.description && (
          <CardDescription>{event.description}</CardDescription>
        )}
        <CardCreatorInfo data-server-date>{creatorMessage}</CardCreatorInfo>
      </CardBody>
      {menuItems.length > 0 && (
        <CardAside onClick={handleAsideClick}>
          <EntityMenu items={menuItems} triggerIcon="ellipsis" />
        </CardAside>
      )}
    </CardRoot>
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

  return [
    {
      title: t`Edit event`,
      action: () => onEdit?.(event),
    },
    {
      title: t`Move event`,
      action: () => onMove?.(event),
    },
    {
      title: t`Archive event`,
      action: () => onArchive?.(event),
    },
  ];
};

const getDateMessage = (event: TimelineEvent) => {
  const date = event.timestamp;
  const options = Settings.formattingOptions();

  if (event.time_matters) {
    return formatDateTimeWithUnit(date, "default", options);
  } else {
    return formatDateTimeWithUnit(date, "day", options);
  }
};

const getCreatorMessage = (event: TimelineEvent) => {
  const options = Settings.formattingOptions();
  const createdAt = formatDateTimeWithUnit(event.created_at, "day", options);

  if (event.creator) {
    return t`${event.creator.common_name} added this on ${createdAt}`;
  } else {
    return t`Added on ${createdAt}`;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(EventCard);
