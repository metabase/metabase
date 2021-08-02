import styled from "styled-components";
import { Flex } from "grid-styled";

export const CardContent = styled(Flex)``;

export const IconContainer = styled(Flex)`
  width: ${props => (props.hasCircle ? "52px" : "32px")};
  height: ${props => (props.hasCircle ? "52px" : "32px")};
  background-color: ${props => (props.hasCircle ? "#EEF2F5" : "transparent")};
`;

export const DriverWarningContainer = styled(Flex)`
  background-color: #f9fbfb;
  border-radius: 10px;
  width: 300px;
  margin-bottom: 8px;
`;
