import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  getDefaultTimelineName,
  getSortedTimelines,
} from "metabase/common/utils/timelines";
import S from "metabase/timelines/common/components/TimelineModal.module.css";
import { TimelineModalHeader } from "metabase/timelines/common/components/TimelineModalHeader";
import { MODAL_MIN_HEIGHT } from "metabase/timelines/common/constants";
import {
  ActionIcon,
  Flex,
  Icon,
  Menu,
  Modal,
  NO_ANIMATION_MODAL_PROPS,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection, Timeline } from "metabase-types/api";

import SearchEmptyState from "../SearchEmptyState";
import TimelineEmptyState from "../TimelineEmptyState";
import TimelineList from "../TimelineList";

export interface TimelineListModalProps {
  timelines: Timeline[];
  collection: Collection;
  isArchive?: boolean;
  onUnarchive?: (timeline: Timeline) => void;
  onClose: () => void;
  onGoBack?: (collection: Collection) => void;
}

const TimelineListModal = ({
  timelines,
  collection,
  isArchive = false,
  onUnarchive,
  onClose,
  onGoBack,
}: TimelineListModalProps): JSX.Element => {
  const title = getTitle(timelines, collection, isArchive);
  const menuItems = getMenuItems(collection, isArchive);
  const hasTimelines = timelines.length > 0;
  const hasMenuItems = menuItems.length > 0;

  const sortedTimelines = useMemo(() => {
    return getSortedTimelines(timelines, collection);
  }, [timelines, collection]);

  const handleGoBack = useCallback(() => {
    onGoBack?.(collection);
  }, [collection, onGoBack]);

  return (
    <Modal.Root
      opened
      size="lg"
      classNames={{ content: S.content, body: S.body }}
      onClose={onClose}
      {...NO_ANIMATION_MODAL_PROPS}
    >
      <Modal.Overlay />
      <Modal.Content mih={MODAL_MIN_HEIGHT}>
        <TimelineModalHeader
          title={title}
          collectionName={hasTimelines ? collection.name : undefined}
          actions={
            hasMenuItems && (
              <Menu position="bottom-end" shadow="sm">
                <Menu.Target>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    aria-label={t`Timelines menu`}
                  >
                    <Icon name="ellipsis" />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>{menuItems}</Menu.Dropdown>
              </Menu>
            )
          }
          onGoBack={isArchive ? handleGoBack : undefined}
        />
        <Modal.Body>
          <Flex
            className={S.scrollArea}
            justify={hasTimelines ? undefined : "center"}
          >
            {hasTimelines ? (
              <TimelineList
                timelines={sortedTimelines}
                onUnarchive={onUnarchive}
              />
            ) : isArchive ? (
              <SearchEmptyState isTimeline={isArchive} />
            ) : (
              <TimelineEmptyState collection={collection} />
            )}
          </Flex>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineListModal;
