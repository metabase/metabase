// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Button from "metabase/common/components/Button";

export const TimelineContainer = styled.ul`
  position: relative;
  margin-left: 0.5rem;
`;

export const TimelineEvent = styled.li`
  display: flex;
  align-items: start;
  justify-content: start;
  transform: translateX(-0.5rem);
  white-space: pre-line;
  width: 100%;
  margin-bottom: 1.5rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

export const EventBody = styled.div`
  margin-left: 0.5rem;
  flex: 1;
`;

export const EventHeader = styled.div`
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  align-items: start;

  ${Button} {
    padding: 0;
  }
`;

export const Timestamp = styled.time`
  color: var(--mb-color-text-secondary);
  font-size: 0.875em;
  padding-bottom: 0.5rem;
`;

// shift the border down slightly so that it doesn't appear above the top-most icon
// also using a negative `bottom` to connect the border with the event icon beneath it
export const Border = styled.div`
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  bottom: -1.5rem;
`;
