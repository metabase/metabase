// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import MetabotLogo from "metabase/core/components/MetabotLogo";
import { breakpointMinExtraLarge } from "metabase/styled-components/theme";

export const GreetingRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const GreetingLogoContainer = styled.div`
  position: relative;
  width: 3.375rem;
  height: 2.5rem;
  margin-inline-end: 0.5rem;

  ${breakpointMinExtraLarge} {
    width: 4rem;
    height: 3rem;
  }
`;

export const GreetingLogo = styled(MetabotLogo)<{ isCool: boolean }>`
  width: 100%;
  position: absolute;
  top: 0;
  opacity: ${props => (props.isCool ? 1 : 0)};
`;

interface GreetingMessageProps {
  showLogo?: boolean;
}

export const GreetingMessage = styled.span<GreetingMessageProps>`
  color: var(--mb-color-text-dark);
  font-size: ${props => (props.showLogo ? "1.125rem" : "1.25rem")};
  font-weight: bold;
  line-height: 1.5rem;
  margin-left: ${props => props.showLogo && "0.5rem"};

  ${breakpointMinExtraLarge} {
    font-size: ${props => (props.showLogo ? "1.25rem" : "1.5rem")};
  }
`;
