import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { getDefaultTimelineName } from "metabase/common/utils/timelines";
import type { TimelineModalHeaderProps } from "metabase/timelines/common/components/TimelineModalHeader";
import { ActionIcon, Icon, Menu } from "metabase/ui";
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
  const hasMenuItems = menuItems.length > 0;

  return {
    title,
    collectionName: hasTimelines ? collection.name : undefined,
    actions: hasMenuItems && (
      <Menu position="bottom-end" shadow="sm">
        <Menu.Target>
          <ActionIcon size="sm" variant="subtle" aria-label={t`Timelines menu`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>{menuItems}</Menu.Dropdown>
      </Menu>
    ),
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

const getMenuItems = (collection: Collection, isArchive: boolean) => {
  if (!collection.can_write || isArchive) {
    return [];
  }

  return [
    <Menu.Item
      key="new-timeline"
      component={ForwardRefLink}
      to={Urls.newTimelineInCollection(collection)}
    >
      {t`New timeline`}
    </Menu.Item>,
    <Menu.Item
      key="view-archived-timelines"
      component={ForwardRefLink}
      to={Urls.timelinesArchiveInCollection(collection)}
    >
      {t`View archived timelines`}
    </Menu.Item>,
  ];
};
