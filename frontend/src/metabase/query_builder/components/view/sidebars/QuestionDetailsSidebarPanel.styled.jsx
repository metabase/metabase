import styled from "styled-components";
import { color } from "metabase/lib/colors";
import QuestionActivityTimeline from "metabase/query_builder/components/QuestionActivityTimeline";

export const SidebarContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  row-gap: 1rem;
  padding: 0.5rem 1.5rem;
`;

export const PanelSection = styled.div`
  border-top: 1px solid ${color("border")};
`;

export const BorderedQuestionActivityTimeline = styled(
  QuestionActivityTimeline,
)`
  border-top: 1px solid ${color("border")};
  padding-top: 1rem;
`;
