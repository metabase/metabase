import { t } from "ttag";

import { Markdown } from "metabase/common/components/Markdown";
import { Box, Flex, Icon, Text } from "metabase/ui";
import Settings from "metabase/utils/settings";
import { formatDateTimeWithUnit } from "metabase/visualizations/lib/formatting";
import type { TimelineEvent } from "metabase-types/api";

import S from "./TimelineEventInfo.module.css";

interface TimelineEventInfoProps {
  event: TimelineEvent;
}

export function TimelineEventInfo({ event }: TimelineEventInfoProps) {
  const dateMessage = getDateMessage(event);
  const creatorMessage = getCreatorMessage(event);

  return (
    <Box>
      <Flex align="flex-start" gap="0.25rem">
        <Icon name={event.icon} size={16} mt="0.25rem" flex="0 0 auto" />
        <Text fz="0.75rem" lh="1.5rem" fw="bold">
          {dateMessage}
        </Text>
      </Flex>
      <Text
        className={S.title}
        fz="1rem"
        lh="1.25rem"
        fw="bold"
        c="text-primary"
      >
        {event.name}
      </Text>
      {event.description && (
        <Markdown className={S.description}>{event.description}</Markdown>
      )}
      <Text mt="0.25rem" fz="0.75rem" c="text-secondary" data-server-date>
        {creatorMessage}
      </Text>
    </Box>
  );
}

function getDateMessage(event: TimelineEvent) {
  const options = Settings.formattingOptions();
  const unit = event.time_matters ? "default" : "day";
  return formatDateTimeWithUnit(event.timestamp, unit, options);
}

function getCreatorMessage(event: TimelineEvent) {
  const options = Settings.formattingOptions();
  const createdAt = formatDateTimeWithUnit(event.created_at, "day", options);

  if (event.creator) {
    return t`${event.creator.common_name} added this on ${createdAt}`;
  }
  return t`Added on ${createdAt}`;
}
