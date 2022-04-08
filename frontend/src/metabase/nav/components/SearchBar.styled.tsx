import styled from "@emotion/styled";
import { css } from "@emotion/react";

import Icon from "metabase/components/Icon";

import { APP_BAR_HEIGHT } from "metabase/nav/constants";

import { color } from "metabase/lib/colors";

import {
  breakpointMaxSmall,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

const activeInputCSS = css`
  border-radius: 6px;
  justify-content: flex-start;
`;

export const SearchInputContainer = styled.div<{ isActive: boolean }>`
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  position: relative;

  background-color: ${color("bg-light")};
  border: 1px solid ${color("border")};

  overflow: hidden;

  transition: background 150ms, width 0.2s;

  &:hover {
    background-color: ${color("bg-medium")};
  }

  @media (prefers-reduced-motion) {
    transition: none;
  }

  ${breakpointMaxSmall} {
    justify-content: center;
    margin-left: auto;

    width: 2rem;
    height: 2rem;
    border-radius: 99px;

    ${props =>
      props.isActive &&
      css`
        width: 95%;
        ${activeInputCSS};
      `}
  }

  ${breakpointMinSmall} {
    max-width: 50em;
    ${activeInputCSS};
  }
`;

export const SearchInput = styled.input<{ isActive: boolean }>`
  background-color: transparent;
  border: none;
  color: ${color("text-dark")};
  font-weight: 700;

  &:focus {
    outline: none;
  }

  &::placeholder {
    color: ${color("text-dark")};
  }

  ${breakpointMinSmall} {
    padding: 10px 12px;
  }

  ${breakpointMaxSmall} {
    width: 0;

    ${props =>
      props.isActive &&
      css`
        width: 100%;
        padding-top: 10px;
        padding-bottom: 10px;
      `}
  }
`;

const ICON_MARGIN = "10px";

export const SearchIcon = styled(Icon)<{ isActive: boolean }>`
  ${breakpointMaxSmall} {
    margin-left: ${props => (props.isActive ? ICON_MARGIN : "3px")};
    margin-right: ${props => (props.isActive ? ICON_MARGIN : 0)};
    transition: margin 0.3s;
  }

  ${breakpointMinSmall} {
    margin-left: ${ICON_MARGIN};
  }
`;

export const ClearIconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;

  width: 3rem;
  height: 100%;

  color: ${color("text-light")};

  cursor: pointer;
`;

export const SearchResultsFloatingContainer = styled.div`
  position: absolute;
  left: 0;
  right: 0;

  color: ${color("text-dark")};

  ${breakpointMaxSmall} {
    top: ${APP_BAR_HEIGHT};
  }

  ${breakpointMinSmall} {
    top: 60px;
  }
`;

export const SearchResultsContainer = styled.div`
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  overflow-y: auto;

  background-color: ${color("bg-white")};
  line-height: 24px;

  box-shadow: 0 20px 20px ${color("shadow")};

  ${breakpointMaxSmall} {
    height: calc(100vh - ${APP_BAR_HEIGHT});
  }

  ${breakpointMinSmall} {
    max-height: 400px;

    border: 1px solid ${color("border")};
    border-radius: 6px;
    box-shadow: 0 7px 20px ${color("shadow")};
  }
`;
