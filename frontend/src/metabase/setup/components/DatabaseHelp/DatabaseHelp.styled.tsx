import styled from "@emotion/styled";
import { breakpointMinLarge } from "metabase/styled-components/theme";

interface DatabaseHelpRootProps {
  isVisible: boolean;
}

export const DatabaseHelpRoot = styled.div<DatabaseHelpRootProps>`
  display: ${props => (props.isVisible ? "block" : "none")};
  margin-bottom: 1.75rem;

  ${breakpointMinLarge} {
    display: block;
    position: fixed;
    right: 2em;
    bottom: 2em;
    max-width: 20%;
    margin-bottom: 0;
    transform: ${props => `translateY(${props.isVisible ? "0" : "200%"})`};
    transition: transform 0.4s;
  }
`;
