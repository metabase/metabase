import styled from "styled-components";

import colors, { color } from "metabase/lib/colors";

export const PermissionsSelectOptionRoot = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
`;

export const IconContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  width: 20px;
  height: 20px;
  color: ${colors["white"]};
  background-color: ${props => color(props.color)};
`;

export const PermissionsSelectLabel = styled.div`
  font-size: 14px;
  font-weight: 700;
  margin: 0;
  padding: 0 0.5rem;
`;
