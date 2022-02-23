import styled from "@emotion/styled";
import DateTime from "metabase/components/DateTime";

export const TimelineEventsList = styled.ul`
  max-width: 300px;

  li:not(:first-of-type) {
    margin-top: 8px;
  }
`;

export const TimelineEventRow = styled.div`
  display: flex;
`;

export const TimelineEventIconContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding-left: 8px;
  padding-right: 14px;
`;

export const TimelineEventInfoContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

export const TimelineEventName = styled.span`
  font-weight: bold;
  font-size: 14px;
`;

export const TimelineEventDate = styled(DateTime)`
  font-size: 12px;
  color: #fafafa;
  margin-top: 1px;
`;
