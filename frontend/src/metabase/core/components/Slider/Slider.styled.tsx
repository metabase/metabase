import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { alpha } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const THUMB_SIZE = "1.2rem";

const activeThumbStyle = css`
  box-shadow: 0 0 4px 1px var(--mb-color-brand);
`;

export const SliderContainer = styled.div`
  position: relative;
  display: flex;
  width: 100%;
  margin-right: calc(${THUMB_SIZE} / 2);
`;

const thumbStyles = `
  -webkit-appearance: none;
  width: ${THUMB_SIZE};
  height: ${THUMB_SIZE};
  border-radius: 50%;
  border: 2px solid var(--mb-color-brand);
  box-sizing: border-box;
  background-color: var(--mb-color-bg-white);
  cursor: pointer;
  box-shadow: 0 0 2px 1px var(--mb-color-brand);
  pointer-events: all;
  &:active {
    ${activeThumbStyle}
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
  &:focus {
    &::-webkit-slider-thumb {
      ${activeThumbStyle}
    }
    &::-moz-range-thumb {
      ${activeThumbStyle}
    }
  }
`;

export const SliderTrack = styled.span`
  width: calc(100% - ${THUMB_SIZE});
  margin-left: calc(${THUMB_SIZE} / 2);
  background-color: ${() => alpha("brand", 0.5)};
  height: 0.2rem;
  border-radius: 0.2rem;
`;

export const ActiveTrack = styled.span`
  position: absolute;
  background-color: var(--mb-color-brand);
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
  background: var(--mb-color-bg-black);
  color: var(--mb-color-text-white);
  display: block;
  border-radius: ${space(1)};
  opacity: 0;
  transition: opacity 0.2s ease-in-out;

  &:before {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    border-top: 10px solid var(--mb-color-bg-black);
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    margin-top: -1px;
  }
`;
export const TooltipContainer = styled.div`
  position: absolute;
  width: calc(100% - ${THUMB_SIZE});
`;
