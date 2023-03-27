import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";

export const FeedbackSelectionRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

export const WrongDataFormRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const FeedbackInputRoot = styled.div`
  position: relative;
`;

export const FeedbackButton = styled(Button)`
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
`;
