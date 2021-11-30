import styled, { css } from "styled-components";
import { color } from "metabase/lib/colors";

export const TabBar = styled.ul`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 16px;
`;

export const Tab = styled.label<{ selected: boolean }>`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  padding: 8px 12px;

  color: ${color("text-white")};
  font-weight: bold;

  border: 2px solid rgba(62, 138, 205, 0.5);
  border-radius: 8px;
  cursor: pointer;

  .Icon {
    margin-right: 10px;
  }

  :hover {
    border-color: #2877bc;
  }

  ${props =>
    props.selected &&
    css`
      background-color: #2877bc;
      border-color: #2877bc;
    `}
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
