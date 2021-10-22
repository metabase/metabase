import styled from "styled-components";

import colors from "metabase/lib/colors";

export const DashboardHeaderButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 6px;
  color: ${props => (props.isActive ? colors["brand"] : colors["text-dark"])};
  background-color: ${props =>
    props.isActive ? colors["brand-light"] : "transparent"};
  transition: all 200ms;
  cursor: pointer;

  &:hover {
    color: ${props => (props.isActive ? colors["white"] : colors["brand"])};
    background-color: ${props =>
      props.isActive ? colors["brand"] : "transparent"};
  }
`;
