import { c, t } from "ttag";

import EmptyEvent from "assets/img/empty-states/event.svg";
import { Link } from "metabase/common/components/Link";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Button, Stack, Text, Title, Tooltip } from "metabase/ui";
import type { Collection, Timeline } from "metabase-types/api";

export interface TimelineEmptyStateProps {
  timeline?: Timeline;
  collection?: Collection;
}

const TimelineEmptyState = ({
  timeline,
  collection,
}: TimelineEmptyStateProps): JSX.Element => {
  const link = timeline
    ? Urls.newEventInCollection(timeline)
    : Urls.newEventAndTimelineInCollection(collection);
  const canWrite = timeline
    ? timeline.collection?.can_write
    : collection?.can_write;

  const applicationName = useSelector(getApplicationName);
  return (
    <Stack align="center" ta="center" gap="lg">
      <Tooltip label={t`Launch of v2.0`} offset={-24} opened>
        <Box maw="6rem">
          <img src={EmptyEvent} alt={t`Collection event illustration`} />
        </Box>
      </Tooltip>
      <Box maw="25rem">
        <Title
          order={4}
          mb="sm"
        >{t`Add context to your time series charts`}</Title>
        <Text fz="md">
          {canWrite
            ? c("{0} is the application name")
                .t`Add events to ${applicationName} to show important milestones, launches, or anything else, right alongside your data.`
            : c("{0} is the application name")
                .t`Events in ${applicationName} let you see important milestones, launches, or anything else, right alongside your data.`}
        </Text>
      </Box>
      {canWrite && (
        <Link to={link}>
          <Button variant="filled" w="12.5rem">
            {t`Create event`}
          </Button>
        </Link>
      )}
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineEmptyState;
