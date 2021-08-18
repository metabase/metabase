import styled from "styled-components";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";

export const CardContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const IconContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${props => (props.hasCircle ? "52px" : "32px")};
  height: ${props => (props.hasCircle ? "52px" : "32px")};
  background-color: ${props => (props.hasCircle ? "#EEF2F5" : "transparent")};
`;

export const DriverWarningContainer = styled.div`
  background-color: #f9fbfb;
  border-radius: 10px;
  width: 320px;
  display: flex;
  margin-top: 8px;
  margin-bottom: 8px;
  margin-left: 26px;
  padding: 16px;
`;

export const WarningIcon = styled(Icon)`
  color: ${color("accent5")};
`;

export const WarningParagraph = styled.p`
  margin: ${props => (props.hasMargin ? `${space(1)} 0;` : 0)};
`;
