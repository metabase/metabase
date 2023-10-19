import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { Icon } from "metabase/core/components/Icon";

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

export const SearchBarRoot = styled.div`
  width: 100%;

  ${breakpointMinSmall} {
    position: relative;
  }
`;

export const SearchInputContainer = styled.div<{
  isActive: boolean;
}>`
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  position: relative;

  ${({ isActive }) => {
    if (isActive) {
      return css`
        background-color: ${color("bg-medium")};
      `;
    }
    return css`
      background-color: ${color("white")};

      &:hover {
        background-color: ${color("bg-light")};
      }
    `;
  }}

  border: 1px solid ${color("border")};

  overflow: hidden;

  transition: background 150ms, width 0.2s;

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
        width: 100%;
        ${activeInputCSS};
      `}
  }

  ${breakpointMinSmall} {
    max-width: 50em;
    ${activeInputCSS};
  }
`;

export const SearchInput = styled.input<{
  isActive: boolean;
}>`
  background-color: transparent;
  border: none;
  color: ${({ theme }) => theme.colors.text[2]};
  font-weight: 700;
  font-size: 0.875rem;

  width: 100%;

  &:focus {
    outline: none;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.text[2]};
  }

  ${breakpointMinSmall} {
    padding: 9px 12px;
  }

  ${breakpointMaxSmall} {
    width: 0;
    padding: 0;

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

export const SearchIcon = styled(Icon)<{
  isActive: boolean;
}>`
  ${breakpointMaxSmall} {
    transition: margin 0.3s;

    ${props =>
      props.isActive &&
      css`
        margin-left: ${ICON_MARGIN};
        margin-right: ${ICON_MARGIN};
      `}
  }

  ${breakpointMinSmall} {
    margin-left: ${ICON_MARGIN};
  }
`;

export const CloseSearchButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;

  width: 3rem;
  height: 100%;

  color: ${color("text-light")};

  cursor: pointer;

  &:hover {
    color: ${color("text-medium")};
  }
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
    top: 42px;
  }
`;
