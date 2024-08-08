import styled from "@emotion/styled";

import { alpha, color, lighten } from "metabase/lib/colors";

interface ToasterContainerProps {
  show: boolean;
  fixed?: boolean;
}

export const ToasterContainer = styled.div<ToasterContainerProps>`
  display: flex;
  flex-direction: row;
  overflow-x: hidden;
  max-width: 388px;
  background-color: ${color("text-dark")};
  padding: 16px;
  border-radius: 6px;
  ${props =>
    props.fixed
      ? `position: fixed;
       bottom: ${props.show ? "20px" : "10px"};
       left: 20px;`
      : `position: relative;
       bottom: ${props.show ? "0px" : "-10px"};`}
  opacity: ${props => (props.show ? 1 : 0)};
  transition: all 200ms ease-out;
  column-gap: 16px;
  align-items: center;
  z-index: 100;
`;

export const ToasterMessage = styled.p`
  color: ${color("white")};
  width: 250px;
  line-height: 24px;
  font-size: 14px;
  margin: 0;
`;

export const ToasterButton = styled.button`
  display: flex;
  padding: 7px 18px;
  background-color: ${alpha(color("bg-white"), 0.1)};
  border-radius: 6px;
  color: ${color("white")};
  width: 90px;
  height: fit-content;
  font-size: 14px;
  font-weight: bold;
  transition: background 200ms ease;

  &:hover {
    cursor: pointer;
    background-color: ${alpha(color("bg-white"), 0.3)};
  }
`;

export const ToasterDismiss = styled.button`
  cursor: pointer;
  transition: color 200ms ease;
  color: ${color("bg-dark")};

  &:hover {
    color: ${lighten("bg-dark", 0.3)};
  }
`;
