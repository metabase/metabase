import React from "react";
import _ from "underscore";
import { t } from "ttag";
import { getRelativeTime } from "metabase/lib/time";

import type { Revision } from "metabase-types/api";
import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";

import {
  TimelineContainer,
  TimelineEvent,
  Border,
  StyledIcon,
  EventBody,
  EventHeader,
  Timestamp,
} from "./Timeline.styled";

const ICON_SIZE = 16;
const HALF_ICON_SIZE = ICON_SIZE / 2;

type Icon = string | { name: string; color: string } | Record<string, never>;
export type TimelineEvent = {
  title: string;
  timestamp: string;
  icon: Icon;
  description?: string;
  revision?: Revision;
};

interface TimelineProps {
  events: TimelineEvent[];
  "data-testid": string;
  canWrite: boolean;
  revert: (revision: Revision) => void;
  className?: string;
}

export function Timeline({
  events,
  "data-testid": dataTestId,
  canWrite,
  revert,
  className,
}: TimelineProps) {
  return (
    <TimelineContainer
      leftShift={HALF_ICON_SIZE}
      bottomShift={HALF_ICON_SIZE}
      className={className}
      data-testid={dataTestId}
    >
      {events.map((event, index) => {
        const { icon, title, description, timestamp, revision } = event;
        const isNotLastEvent = index !== events.length - 1;
        const isNotFirstEvent = index !== 0;

        return (
          <TimelineEvent
            key={revision?.id ?? `${title}-${timestamp}`}
            leftShift={HALF_ICON_SIZE}
          >
            {isNotLastEvent && <Border borderShift={HALF_ICON_SIZE} />}
            <EventIcon icon={icon} />
            <EventBody>
              <EventHeader>
                <span>{title}</span>
                {revision && canWrite && isNotFirstEvent && (
                  <Tooltip tooltip={t`Revert to this version`}>
                    <Button
                      icon="revert"
                      onlyIcon
                      borderless
                      onClick={() => revert(revision)}
                      data-testid="question-revert-button"
                      aria-label={t`revert to ${title}`}
                    />
                  </Tooltip>
                )}
              </EventHeader>
              <Timestamp dateTime={timestamp}>
                {getRelativeTime(timestamp)}
              </Timestamp>
              {revision?.has_multiple_changes && <div>{description}</div>}
            </EventBody>
          </TimelineEvent>
        );
      })}
    </TimelineContainer>
  );
}

function EventIcon({ icon }: { icon: Icon }) {
  if (_.isObject(icon) && (!icon.name || !icon.color)) {
    return null;
  }
  if (_.isObject(icon)) {
    return (
      <StyledIcon
        {...(icon as { name: string; color: string })}
        size={ICON_SIZE}
      />
    );
  }
  return <StyledIcon name={icon} size={ICON_SIZE} />;
}
