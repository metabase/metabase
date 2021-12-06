import styled, { css } from "styled-components";
import { alpha, darken, color } from "metabase/lib/colors";

export const TabBar = styled.ul`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 16px;
`;

function getActiveTabColor() {
  return darken("nav");
}

function getInactiveTabColor() {
  const active = getActiveTabColor();
  return alpha(active, 0.3);
}

const inactiveTabCSS = css`
  border-color: ${getInactiveTabColor()};

  :hover {
    background-color: ${getInactiveTabColor()};
  }
`;

const activeTabCSS = css`
  background-color: ${getActiveTabColor()};
  border-color: ${getActiveTabColor()};
`;

export const Tab = styled.label<{ selected: boolean }>`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  padding: 6px 12px;

  color: ${color("text-white")};
  font-weight: bold;

  border: 2px solid;
  border-radius: 8px;
  cursor: pointer;

  transition: all 0.3s;

  .Icon {
    margin-right: 10px;
  }

  ${props => (props.selected ? activeTabCSS : inactiveTabCSS)};
`;

export const RadioInput = styled.input.attrs({ type: "radio" })`
  cursor: inherit;
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  top: 0;
  left: 0;
  margin: 0;
  padding: 0;
  z-index: 1;
`;
