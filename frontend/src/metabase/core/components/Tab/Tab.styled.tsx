import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Ellipsified from "../Ellipsified";

export interface TabProps {
  isSelected?: boolean;
}

export const TabRoot = styled.button<TabProps>`
  display: inline-flex;
  align-items: center;
  color: ${props => (props.isSelected ? color("brand") : color("text-dark"))};
  cursor: pointer;
  padding-bottom: 0.75rem;
  border-bottom: 0.125rem solid
    ${props => (props.isSelected ? color("brand") : "transparent")};

  &:hover {
    color: ${color("brand")};
    border-color: ${color("brand")};
  }

  &:focus {
    outline: 2px solid ${color("focus")};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;

export const TabIcon = styled(Icon)`
  width: 1rem;
  height: 1rem;
  margin-right: 0.25rem;
`;

export const TabLabel = styled(Ellipsified)`
  font-size: 1rem;
  font-weight: bold;
  max-width: 16rem;
`;
