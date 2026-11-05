import { t } from "ttag";

import { getTimelineName } from "metabase/common/utils/timelines";
import type {
  TimelineModalHeaderProps,
  TimelineModalMenuItem,
} from "metabase/timelines/common/components/TimelineModalHeader";
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
    menu: { label: t`Timeline menu`, items: menuItems },
    onGoBack: canGoBack && onGoBack ? () => onGoBack(timeline) : undefined,
  };
}

const getMenuItems = (
  timeline: Timeline,
  isArchive: boolean,
  isOnlyTimeline: boolean,
) => {
  const items: TimelineModalMenuItem[] = [];

  if (timeline.collection?.can_write && !isArchive) {
    items.push(
      {
        label: t`New timeline`,
        to: Urls.newTimelineInCollection(timeline.collection),
      },
      {
        label: t`Edit timeline details`,
        to: Urls.editTimelineInCollection(timeline),
      },
      {
        label: t`Move timeline`,
        to: Urls.moveTimelineInCollection(timeline),
      },
    );
  }

  if (!isArchive) {
    items.push({
      label: t`View archived events`,
      to: Urls.timelineArchiveInCollection(timeline),
    });
  }

  if (isOnlyTimeline) {
    items.push({
      label: t`View archived timelines`,
      to: Urls.timelinesArchiveInCollection(timeline.collection),
    });
  }

  return items;
};
