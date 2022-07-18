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
  color: ${props =>
    props.isSelected ? color("text-dark") : color("text-light")};
  cursor: pointer;

  margin-bottom: 0.75rem;
  padding-bottom: 0.25rem;

  &:first-of-type {
    padding-right: 1.5rem;
    border-right: ${color("border")} 1px solid;
  }

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
  margin-right: 0.5rem;
`;

export const TabLabel = styled(Ellipsified)`
  font-size: 1rem;
  font-weight: bold;
  max-width: 16rem;
`;
