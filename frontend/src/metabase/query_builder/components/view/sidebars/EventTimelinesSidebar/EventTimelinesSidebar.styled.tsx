import styled from "@emotion/styled";
import CollapseSection from "metabase/components/CollapseSection";
import { color } from "metabase/lib/colors";

export const TimelineList = styled.ul`
  margin-left: 1.5rem;
  margin-right: 1.5rem;
  padding-top: 0.5rem;

  li:not(:first-of-type) {
    margin-top: 0.6rem;
  }

  ${CollapseSection.Header} {
    justify-content: space-between;
  }
`;

export const TimelineListItemContainer = styled.div`
  display: flex;
`;

export const TimelineName = styled.span`
  color: ${color("text-dark")};
  font-weight: bold;
  font-size: 0.875rem;
  margin-left: 8px;
`;

export const EventListContainer = styled.div`
  padding-top: 1rem;
  padding-bottom: 1rem;

  li:not(:first-of-type) {
    margin-top: 8px;
  }
`;
