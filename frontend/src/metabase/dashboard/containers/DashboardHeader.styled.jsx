import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const DashboardHeaderButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 6px;
  color: ${props => (props.isActive ? color("brand") : color("text-dark"))};
  background-color: ${props =>
    props.isActive ? color("brand-light") : "transparent"};
  transition: all 200ms;

  &:hover:enabled {
    cursor: pointer;
    color: ${props => (props.isActive ? color("white") : color("brand"))};
    background-color: ${props =>
      props.isActive ? color("brand") : "transparent"};
  }

  &:disabled {
    color: ${color("text-light")};
  }
`;
