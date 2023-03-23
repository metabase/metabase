import styled from "@emotion/styled";
import MetabotLogo from "metabase/core/components/MetabotLogo";
import { color } from "metabase/lib/colors";

export const GreetingSection = styled.div`
  display: flex;
  align-items: center;
`;

export const MetabotIcon = styled(MetabotLogo)`
  height: 2.5rem;
`;

export const MetabotMessage = styled.div`
  margin-left: 0.5rem;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  color: ${color("text-medium")};
  background-color: ${color("bg-light")};
  font-weight: bold;
`;
