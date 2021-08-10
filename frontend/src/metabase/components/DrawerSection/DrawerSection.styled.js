import styled from "styled-components";

import { color } from "metabase/lib/colors";

const HEADER_HEIGHT = "49px";

export const Container = styled.div`
  min-height: ${HEADER_HEIGHT};
  height: ${props => (props.isOpen ? "auto" : "100%")};
  overflow: ${props => (props.isOpen ? "unset" : "hidden")};
  position: relative;
  width: 100%;
`;

export const Transformer = styled.div`
  height: 100%;
  position: relative;
  width: 100%;

  will-change: transform;
  transform: ${props =>
    props.isOpen
      ? "translateY(0)"
      : `translateY(calc(100% - ${HEADER_HEIGHT}))`};
  transition: transform 0.2s ease-in-out;
`;

export const Children = styled.div`
  display: ${props => (props.isOpen ? "block" : "none")};
  padding: 0 1.5rem;
`;

export const Header = styled.div.attrs({
  role: "button",
  tabIndex: "0",
})`
  height: ${HEADER_HEIGHT};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid ${color("border")};
  font-weight: 700;
  padding: 0 1.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;
