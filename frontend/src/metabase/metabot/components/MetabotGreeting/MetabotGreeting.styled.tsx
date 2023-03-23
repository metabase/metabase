import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import MetabotLogo from "metabase/core/components/MetabotLogo";

export const GreetingRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

export const GreetingMetabotLogo = styled(MetabotLogo)`
  height: 2.5rem;
`;

export const GreetingMessage = styled.div`
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  color: ${color("text-medium")};
  background-color: ${color("bg-light")};
  font-weight: bold;
`;
