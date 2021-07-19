import styled from "styled-components";
import { Flex } from "grid-styled";

export const CardContent = styled(Flex)`
  margin-top: ${props => (props.shouldDisplayHelpLink ? "8px" : 0)};
`;

export const HelpCardContainer = styled(Flex)`
  background-color: #f9fbfb;
  border-radius: 10px;
  min-width: 300px;
`;

export const IconContainer = styled(Flex)`
  width: ${props => (props.hasCircle ? "52px" : "32px")};
  height: ${props => (props.hasCircle ? "52px" : "32px")};
  background-color: ${props => (props.hasCircle ? "#EEF2F5" : "transparent")};
`;
