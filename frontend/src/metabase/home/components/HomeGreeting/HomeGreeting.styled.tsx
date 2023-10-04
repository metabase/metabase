import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import MetabotLogo from "metabase/core/components/MetabotLogo";
import { breakpointMinExtraLarge } from "metabase/styled-components/theme";

export const GreetingRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const GreetingLogo = styled(MetabotLogo)`
  padding-right: 0.5rem;
  height: 2.5rem;

  ${breakpointMinExtraLarge} {
    height: 3rem;
  }
`;

export interface GreetingMessageProps {
  showLogo?: boolean;
}

export const GreetingMessage = styled.span<GreetingMessageProps>`
  color: ${color("text-dark")};
  font-size: ${props => (props.showLogo ? "1.125rem" : "1.25rem")};
  font-weight: bold;
  line-height: 1.5rem;
  margin-left: ${props => props.showLogo && "0.5rem"};

  ${breakpointMinExtraLarge} {
    font-size: ${props => (props.showLogo ? "1.25rem" : "1.5rem")};
  }
`;
