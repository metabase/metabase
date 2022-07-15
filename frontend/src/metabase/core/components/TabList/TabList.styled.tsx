import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const TabListRoot = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

export const TabListContent = styled.div`
  overflow-x: hidden;
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
  scroll-behavior: smooth;
`;

interface ScrollButtonProps {
  directionIcon: "left" | "right";
}

export const ScrollButton = styled.button<ScrollButtonProps>`
  position: absolute;
  cursor: pointer;
  height: 100%;
  width: 3rem;
  padding-bottom: ${space(2)};
  text-align: ${props => props.directionIcon};
  color: ${color("text-light")};
  &:hover {
    color: ${color("brand")};
  }
  ${props => props.directionIcon}: 0;
  background: linear-gradient(
    to ${props => props.directionIcon},
    ${alpha("white", 0.1)},
    ${alpha("white", 0.5)},
    30%,
    ${color("white")}
  );
`;
