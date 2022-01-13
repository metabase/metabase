import styled from "styled-components";
import { breakpointMinLarge } from "metabase/styled-components/theme";

interface DatabaseHelpRootProps {
  isVisible: boolean;
}

export const DatabaseHelpRoot = styled.div<DatabaseHelpRootProps>`
  transform: ${props => `translateY(${props.isVisible ? "0" : "200%"})`};
  transition: transform 0.4s;
  margin-bottom: 1.75rem;

  ${breakpointMinLarge} {
    position: fixed;
    right: 2em;
    bottom: 2em;
    max-width: 20%;
    margin-bottom: 0;
  }
`;
