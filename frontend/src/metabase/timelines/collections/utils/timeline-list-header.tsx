import { t } from "ttag";

import { getDefaultTimelineName } from "metabase/common/utils/timelines";
import type {
  TimelineModalHeaderProps,
  TimelineModalMenuItem,
} from "metabase/timelines/common/components/TimelineModalHeader";
import * as Urls from "metabase/urls";
import type { Collection, Timeline } from "metabase-types/api";

type TimelineListHeaderOptions = {
  isArchive?: boolean;
  onGoBack?: (collection: Collection) => void;
};

/**
 * Header props for a collection's timelines modal: the title, the "⋯" menu and
 * the collection's name when it has timelines. The back button is only shown
 * with `isArchive` and calls `onGoBack`.
 */
export function getTimelineListHeaderProps(
  timelines: Timeline[],
  collection: Collection,
  { isArchive = false, onGoBack }: TimelineListHeaderOptions = {},
): TimelineModalHeaderProps {
  const title = getTitle(timelines, collection, isArchive);
  const menuItems = getMenuItems(collection, isArchive);
  const hasTimelines = timelines.length > 0;

  return {
    title,
    collectionName: hasTimelines ? collection.name : undefined,
    menu: { label: t`Timelines menu`, items: menuItems },
    onGoBack: isArchive && onGoBack ? () => onGoBack(collection) : undefined,
  };
}

const getTitle = (
  timelines: Timeline[],
  collection: Collection,
  isArchive: boolean,
) => {
  if (isArchive) {
    return t`Archived timelines`;
  } else if (timelines.length) {
    return t`Events`;
  } else {
    return getDefaultTimelineName(collection);
  }
};

const getMenuItems = (
  collection: Collection,
  isArchive: boolean,
): TimelineModalMenuItem[] => {
  if (!collection.can_write || isArchive) {
    return [];
  }

  return [
    {
      label: t`New timeline`,
      to: Urls.newTimelineInCollection(collection),
    },
    {
      label: t`View archived timelines`,
      to: Urls.timelinesArchiveInCollection(collection),
    },
  ];
};
