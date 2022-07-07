import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const TooltipContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

export const TooltipText = styled.span`
  font-size: 0.875rem;
  line-height: 1rem;
  margin-bottom: 0.25rem;
  font-weight: 700;
`;

export const TooltipTime = styled.time`
  color: ${color("text-medium")};
  font-size: 0.766rem;
  line-height: 1.25rem;
`;
