import styled from "@emotion/styled";

import Toggle from "metabase/core/components/Toggle";
import { color } from "metabase/lib/colors";

export const StepDescription = styled.div`
  margin: 0.875rem 0 1.25rem;
  color: ${color("text-medium")};
`;

export const StepToggleContainer = styled.div`
  display: flex;
  align-items: center;
  margin: 0 2rem 1.25rem 0;
  padding: 1rem;
  border: 2px solid ${color("border")};
  border-radius: 0.5rem;
`;

export const StepToggle = styled(Toggle)`
  flex: 0 0 auto;
`;

export const StepToggleLabel = styled.div`
  color: ${color("text-medium")};
  margin-left: 0.5rem;
`;

export const StepInfoList = styled.ul`
  margin: 0 0 1.25rem;
  color: ${color("text-medium")};
  list-style: disc inside;
  line-height: 2;
`;

export const StepError = styled.div`
  color: ${color("error")};
  margin-top: 0.5rem;
`;
