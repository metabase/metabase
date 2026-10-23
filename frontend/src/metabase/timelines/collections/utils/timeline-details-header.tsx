import type { JSX } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { getTimelineName } from "metabase/common/utils/timelines";
import type { TimelineModalHeaderProps } from "metabase/timelines/common/components/TimelineModalHeader";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Timeline } from "metabase-types/api";

type TimelineDetailsHeaderOptions = {
  isArchive?: boolean;
  isOnlyTimeline?: boolean;
  onGoBack?: (timeline: Timeline) => void;
};

/**
 * Header props for a timeline's events modal: its name (or "Archived events")
 * and "⋯" menu. The back button calls `onGoBack`, and isn't shown for a
 * collection's only timeline unless `isArchive`.
 */
export function getTimelineDetailsHeaderProps(
  timeline: Timeline,
  {
    isArchive = false,
    isOnlyTimeline = false,
    onGoBack,
  }: TimelineDetailsHeaderOptions = {},
): TimelineModalHeaderProps {
  const title = isArchive ? t`Archived events` : getTimelineName(timeline);
  const menuItems = getMenuItems(timeline, isArchive, isOnlyTimeline);
  const canGoBack = isArchive || !isOnlyTimeline;

  return {
    title,
    actions: menuItems.length > 0 && (
      <Menu position="bottom-end" shadow="sm">
        <Menu.Target>
          <ActionIcon size="sm" variant="subtle" aria-label={t`Timeline menu`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>{menuItems}</Menu.Dropdown>
      </Menu>
    ),
    onGoBack: canGoBack && onGoBack ? () => onGoBack(timeline) : undefined,
  };
}

const getMenuItems = (
  timeline: Timeline,
  isArchive: boolean,
  isOnlyTimeline: boolean,
) => {
  const items: JSX.Element[] = [];

  if (timeline.collection?.can_write && !isArchive) {
    items.push(
      <Menu.Item
        key="new-timeline"
        component={ForwardRefLink}
        to={Urls.newTimelineInCollection(timeline.collection)}
      >
        {t`New timeline`}
      </Menu.Item>,
      <Menu.Item
        key="edit-timeline-details"
        component={ForwardRefLink}
        to={Urls.editTimelineInCollection(timeline)}
      >
        {t`Edit timeline details`}
      </Menu.Item>,
      <Menu.Item
        key="move-timeline"
        component={ForwardRefLink}
        to={Urls.moveTimelineInCollection(timeline)}
      >
        {t`Move timeline`}
      </Menu.Item>,
    );
  }

  if (!isArchive) {
    items.push(
      <Menu.Item
        key="view-archived-events"
        component={ForwardRefLink}
        to={Urls.timelineArchiveInCollection(timeline)}
      >
        {t`View archived events`}
      </Menu.Item>,
    );
  }

  if (isOnlyTimeline) {
    items.push(
      <Menu.Item
        key="view-archived-timelines"
        component={ForwardRefLink}
        to={Urls.timelinesArchiveInCollection(timeline.collection)}
      >
        {t`View archived timelines`}
      </Menu.Item>,
    );
  }

  return items;
};
