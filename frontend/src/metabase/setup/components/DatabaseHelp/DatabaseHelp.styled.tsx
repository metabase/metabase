import styled from "styled-components";

interface DatabaseHelpRootProps {
  isVisible: boolean;
}

export const DatabaseHelpRoot = styled.div<DatabaseHelpRootProps>`
  position: fixed;
  right: 2em;
  bottom: 2em;
  transform: ${props => `translateY(${props.isVisible ? "0" : "200%"})`};
  transition: transform 0.4s;
`;
