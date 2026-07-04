import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils/errors";
import { getFormattedTime } from "metabase/common/components/DateTime/DateTime";
import type { RevisionOrModerationEvent } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { Box, Button, Center, Flex, Icon, Text, Tooltip } from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type { Revision } from "metabase-types/api";

import S from "./RevisionHistoryTimeline.module.css";
import { trackVersionRevertClicked } from "./analytics";

export type RevisionHistoryEntity =
  | "card"
  | "dashboard"
  | "document"
  | "transform";

interface RevisionHistoryTimelineProps {
  entity: RevisionHistoryEntity;
  events: RevisionOrModerationEvent[];
  // Must reject on failure so the timeline can surface a toast. RTK Query
  // callers should pipe the trigger result through `.unwrap()`.
  revert: (revision: Revision) => Promise<unknown>;
  canWrite: boolean;
  className?: string;
  "data-testid": string;
}

export function RevisionHistoryTimeline({
  events,
  "data-testid": dataTestId,
  canWrite,
  revert,
  className,
  entity,
}: RevisionHistoryTimelineProps) {
  const dispatch = useDispatch();

  const handleRevert = async (revision: Revision) => {
    trackVersionRevertClicked(entity);
    try {
      await revert(revision);
    } catch (error) {
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message: getErrorMessage(
            error,
            t`Failed to revert to previous version.`,
          ),
        }),
      );
    }
  };

  return (
    <Box className={className} data-testid={dataTestId}>
      <Box className={S.root}>
        {events.map((event, index) => {
          const { icon, title, description, timestamp, revision } = event;
          const isNotFirstEvent = index !== 0;

          return (
            <Box
              key={revision?.id ?? `${title}-${timestamp}`}
              className={S.event}
              data-testid="revision-history-event"
            >
              <EventIconCircle icon={icon} />
              <Flex flex="1">
                <Box>
                  <Text fw={700} className={S.title}>
                    {title}
                  </Text>
                  <Box>
                    <Tooltip
                      position="bottom"
                      label={getFormattedTime(timestamp)}
                    >
                      <Text component="time" c="text-secondary" fz="sm">
                        {getRelativeTime(timestamp)}
                      </Text>
                    </Tooltip>
                  </Box>
                  {revision?.has_multiple_changes && (
                    <Text c="text-secondary" mt="sm">
                      {description}
                    </Text>
                  )}
                </Box>
              </Flex>
              <Flex>
                {revision && canWrite && isNotFirstEvent && (
                  <Tooltip label={t`Revert to this version`}>
                    <Button
                      className={S.revertButton}
                      variant="subtle"
                      onClick={() => handleRevert(revision)}
                      data-testid="question-revert-button"
                      aria-label={t`revert to ${title}`}
                    >
                      <Icon name="revert" />
                    </Button>
                  </Tooltip>
                )}
              </Flex>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

interface EventIconCircleProps {
  icon: RevisionOrModerationEvent["icon"];
}

function EventIconCircle({ icon }: EventIconCircleProps) {
  if (typeof icon === "string") {
    return (
      <Center
        w={24}
        h={24}
        className={S.iconCircle}
        bd="1px solid var(--mb-color-border-neutral)"
        bg="background_page-primary"
      >
        <Icon name={icon} c="text-disabled" size={12} />
      </Center>
    );
  }

  if (!icon.name || !icon.color) {
    return null;
  }

  return (
    <Center w={24} h={24} className={S.iconCircle} bg="core-brand">
      <Icon name={icon.name} c="white" size={12} />
    </Center>
  );
}
