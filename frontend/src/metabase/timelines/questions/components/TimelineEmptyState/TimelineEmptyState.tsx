import { t } from "ttag";

import EmptyEvent from "assets/img/empty-states/event.svg";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Button, Stack, Text, Title } from "metabase/ui";
import type { Collection, Timeline } from "metabase-types/api";

export interface TimelineEmptyStateProps {
  timelines: Timeline[];
  collection: Collection;
  onNewEvent?: () => void;
}

const TimelineEmptyState = ({
  timelines,
  collection,
  onNewEvent,
}: TimelineEmptyStateProps): JSX.Element => {
  const canWrite =
    timelines.some(timeline => timeline.collection?.can_write) ||
    collection.can_write;

  const applicationName = useSelector(getApplicationName);

  return (
    // The previous version of the empty state also had a hacky top margin set
    // to arbitrary 10rem. This is because it is almost impossible to center this
    // content vertically without touching element with test-id `sidebar-content`.
    // Doing that would be risky because `SidebarContent` component is used by more
    // than 15 other components at the moment.
    //
    // If we refactor the `TimelineSidebar` in the future, and decouple it from the
    // `SidebarContent`, this empty state should be properly aligned vertically.
    <Stack align="center" ta="center" gap="lg" mt="10rem">
      <img src={EmptyEvent} alt={t`Collection event illustration`} />
      <Box maw="25rem">
        <Title
          order={2}
          size="lg"
          mb="sm"
        >{t`Add context to your time series charts`}</Title>
        <Text fz="md">
          {canWrite
            ? t`Add events to ${applicationName} to show important milestones, launches, or anything else, right alongside your data.`
            : t`Events in ${applicationName} let you see important milestones, launches, or anything else, right alongside your data.`}
        </Text>
      </Box>
      {canWrite && (
        <Button variant="filled" w="12.5rem" onClick={onNewEvent}>
          {t`Create event`}
        </Button>
      )}
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineEmptyState;
