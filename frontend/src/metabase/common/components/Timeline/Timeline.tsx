import { t } from "ttag";
import _ from "underscore";

import { Button } from "metabase/common/components/Button";
import { getFormattedTime } from "metabase/common/components/DateTime/DateTime";
import { getRelativeTime } from "metabase/lib/time-dayjs";
import type { RevisionOrModerationEvent } from "metabase/plugins";
import { Icon, Tooltip } from "metabase/ui";
import type { Revision } from "metabase-types/api";

import {
  Border,
  EventBody,
  EventHeader,
  TimelineContainer,
  TimelineEvent,
  Timestamp,
} from "./Timeline.styled";
import { trackVersionRevertClicked } from "./analytics";

interface TimelineProps {
  events: RevisionOrModerationEvent[];
  "data-testid": string;
  canWrite: boolean;
  revert: (revision: Revision) => void;
  className?: string;
  entity: "card" | "dashboard" | "document" | "transform";
}

export function Timeline({
  events,
  "data-testid": dataTestId,
  canWrite,
  revert,
  className,
  entity,
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
                  <Tooltip label={t`Revert to this version`}>
                    <Button
                      icon="revert"
                      onlyIcon
                      borderless
                      onClick={() => {
                        trackVersionRevertClicked(entity);
                        revert(revision);
                      }}
                      data-testid="question-revert-button"
                      aria-label={t`revert to ${title}`}
                    />
                  </Tooltip>
                )}
              </EventHeader>
              <Tooltip position="bottom" label={getFormattedTime(timestamp)}>
                <Timestamp dateTime={timestamp}>
                  {getRelativeTime(timestamp)}
                </Timestamp>
              </Tooltip>
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
    return <Icon name={icon.name} c={icon.color} size={16} />;
  }
  return <Icon name={icon} c="text-tertiary" size={16} />;
}
