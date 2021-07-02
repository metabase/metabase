import styled from "styled-components";
import { Box } from "grid-styled";

export const Sidebar = styled(Box.withComponent("aside"))`
  bottom: 0;
  display: flex;
  flex-direction: column;
  left: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-top: 32px;
  position: fixed;
  top: 65px;
  width: ${props => props.width};

  @media screen and (max-width: 768px) {
    width: 50px;
  }
`;
