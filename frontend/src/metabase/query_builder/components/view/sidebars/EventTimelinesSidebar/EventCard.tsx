import React from "react";
import { TimelineEvent } from "metabase-types/api/timeline";
import styled from "@emotion/styled";
import DateTime from "metabase/components/DateTime";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

type Props = {
  className?: string;
  event: TimelineEvent;
};

const EventItemRow = styled.div`
  display: flex;
  align-items: center;
`;

const EventInfoContainer = styled.div`
  flex: 1;
  margin-left: 0.6rem;
`;

const EventIcon = styled(Icon)`
  color: ${color("brand")};
  width: 1rem;
  height: 1rem;
`;

const EventIconContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid ${color("border")};
  border-radius: 1rem;
`;

const EventTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 0.875rem;
  line-height: 0.9rem;
  font-weight: bold;
`;

export const EventDateLabel = styled(DateTime)`
  color: ${color("text-medium")};
  font-size: 0.75rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

function EventCard({ className, event }: Props) {
  return (
    <li className={className}>
      <EventItemRow>
        <EventIconContainer>
          <EventIcon name={event.icon} />
        </EventIconContainer>
        <EventInfoContainer>
          <EventDateLabel value={event.timestamp} />
          <EventTitle>{event.name}</EventTitle>
        </EventInfoContainer>
      </EventItemRow>
    </li>
  );
}

export default EventCard;
