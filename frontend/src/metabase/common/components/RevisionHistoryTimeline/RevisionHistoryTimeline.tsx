import { t } from "ttag";

import { getFormattedTime } from "metabase/common/components/DateTime/DateTime";
import { getRelativeTime } from "metabase/lib/time-dayjs";
import type { RevisionOrModerationEvent } from "metabase/plugins";
import { Box, Button, Center, Flex, Icon, Text, Tooltip } from "metabase/ui";
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
  revert: (revision: Revision) => void;
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
                      onClick={() => {
                        trackVersionRevertClicked(entity);
                        revert(revision);
                      }}
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
        bd="1px solid var(--mb-color-border)"
        bg="background-primary"
      >
        <Icon name={icon} c="text-tertiary" size={12} />
      </Center>
    );
  }

  if (!icon.name || !icon.color) {
    return null;
  }

  return (
    <Center w={24} h={24} className={S.iconCircle} bg="brand">
      <Icon name={icon.name} c="white" size={12} />
    </Center>
  );
}
