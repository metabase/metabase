import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";

export const SliderContainer = styled.div`
  position: relative;
  display: flex;
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

interface ActiveTrackProps {
  left: number;
  width: number;
}

export const ActiveTrack = styled.span<ActiveTrackProps>`
  position: absolute;
  left: ${props => props.left}%;
  width: ${props => props.width}%;
  background-color: ${color("brand")};
  height: 0.2rem;
`;
