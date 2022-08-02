import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Icon from "metabase/components/Icon";
import Ellipsified from "../Ellipsified";

export interface TabProps {
  isSelected?: boolean;
}

export const TabRoot = styled.button<TabProps>`
  display: flex;
  width: 100%;
  flex: 1;
  text-align: left;

  color: ${props => (props.isSelected ? color("brand") : color("text-light"))};
  background-color: ${props =>
    props.isSelected ? alpha("brand", 0.1) : "transparent"};
  cursor: pointer;

  margin-bottom: 0.75rem;
  padding: 0.75rem 1rem;
  margin-right: ${space(1)};
  border-radius: ${space(0)};

  &:hover {
    color: ${color("brand")};
  }

  &:focus {
    outline: 2px solid ${color("focus")};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;

export const TabIcon = styled(Icon)`
  width: 0.8rem;
  height: 0.8rem;
  margin-top: 0.2rem;
  margin-right: 0.5rem;
`;

export const TabLabel = styled.div`
  width: 100%;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
`;
