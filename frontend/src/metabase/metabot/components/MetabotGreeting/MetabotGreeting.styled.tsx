import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import MetabotLogo from "metabase/core/components/MetabotLogo";

export const GreetingRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

export const GreetingMetabotLogo = styled(MetabotLogo)`
  height: 2.5rem;
`;

export const GreetingMessage = styled.div`
  display: inline-block;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
  color: ${color("text-medium")};
  font-weight: bold;
`;
