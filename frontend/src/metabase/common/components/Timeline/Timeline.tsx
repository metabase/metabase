import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import { color } from "metabase/lib/colors";
import { getRelativeTime } from "metabase/lib/time";
import type { RevisionOrModerationEvent } from "metabase/plugins";
import { Icon } from "metabase/ui";
import type { Revision } from "metabase-types/api";

import {
  TimelineContainer,
  TimelineEvent,
  Border,
  EventBody,
  EventHeader,
  Timestamp,
} from "./Timeline.styled";

interface TimelineProps {
  events: RevisionOrModerationEvent[];
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
    <TimelineContainer className={className} data-testid={dataTestId}>
      {events.map((event, index) => {
        const { icon, title, description, timestamp, revision } = event;
        const isNotLastEvent = index !== events.length - 1;
        const isNotFirstEvent = index !== 0;

        return (
          <TimelineEvent key={revision?.id ?? `${title}-${timestamp}`}>
            {isNotLastEvent && <Border />}
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

function EventIcon({ icon }: { icon: RevisionOrModerationEvent["icon"] }) {
  if (_.isObject(icon) && (!icon.name || !icon.color)) {
    return null;
  }
  if (_.isObject(icon)) {
    return <Icon name={icon.name} color={color(icon.color)} size={16} />;
  }
  return <Icon name={icon} color={color("text-light")} size={16} />;
}
