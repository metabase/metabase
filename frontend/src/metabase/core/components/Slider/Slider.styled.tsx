import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const SliderContainer = styled.div`
  position: relative;
  display: flex;
  width: 100%;
  margin: 0 ${space(1)};
`;

const thumbStyles = `
  -webkit-appearance: none;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  border: 2px solid ${color("brand")};
  background-color: ${color("white")};
  cursor: pointer;
  box-shadow: 0 0 2px 1px ${color("brand")};
  pointer-events: all;
  &:active {
    box-shadow: 0 0 4px 1px ${color("brand")};
  }
`;

export const SliderInput = styled.input`
  -webkit-appearance: none;
  position: absolute;
  width: 100%;
  height: 0;
  border: none;
  outline: none;
  background: none;
  pointer-events: none;
  &::-webkit-slider-thumb {
    ${thumbStyles}
  }
  &::-moz-range-thumb {
    ${thumbStyles}
  }
`;

export const SliderTrack = styled.span`
  width: 100%;
  background-color: ${alpha("brand", 0.5)};
  height: 0.2rem;
  border-radius: 0.2rem;
`;

export const ActiveTrack = styled.span`
  position: absolute;
  background-color: ${color("brand")};
  height: 0.2rem;
`;

export const SliderTooltip = styled.div`
  position: absolute;
  top: -3rem;
  transform: translateX(-50%);
  font-size: 0.7rem;
  font-weight: bold;
  text-align: center;
  padding: ${space(0.5)} ${space(1)};
  background: ${color("black")};
  color: ${color("white")};
  display: block;
  border-radius: ${space(1)};
  opacity: 0;
  transition: opacity 0.2s ease-in-out;

  &:before {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    border-top: 10px solid ${color("black")};
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    margin-top: -1px;
  }
`;
