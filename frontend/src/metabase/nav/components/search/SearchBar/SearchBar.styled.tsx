import isPropValid from "@emotion/is-prop-valid";
// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import {
  breakpointMaxSmall,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

const activeInputCSS = css`
  border-radius: 6px;
  justify-content: flex-start;
`;

export const SearchBarRoot = styled.div`
  width: 100%;

  ${breakpointMinSmall} {
    max-width: 14.5rem;
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
        background-color: var(--mb-color-background-tertiary);
      `;
    }
    return css`
      background-color: var(--mb-color-background-primary);
      &:hover {
        background-color: var(--mb-color-background-secondary);
      }
    `;
  }}
  border: 1px solid var(--mb-color-border);
  overflow: hidden;
  transition:
    background 150ms,
    width 0.2s;

  @media (prefers-reduced-motion) {
    transition: none;
  }

  ${breakpointMaxSmall} {
    justify-content: center;
    margin-left: auto;
    width: 2rem;
    height: 2rem;
    border-radius: 99px;
    border-color: transparent;
    ${(props) =>
      props.isActive &&
      css`
        width: 100%;
        border-color: var(--mb-color-border);
        ${activeInputCSS};
      `};
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
  color: var(--mb-color-text-primary);
  font-weight: 700;
  font-size: 0.875rem;
  flex-basis: 0;
  flex-grow: 1;

  &:focus {
    outline: none;
  }

  &::placeholder {
    color: var(--mb-color-text-primary);
  }

  ${breakpointMinSmall} {
    padding: 9px 12px;
  }

  ${breakpointMaxSmall} {
    width: 0;
    flex-grow: 0;
    padding: 0;

    ${(props) =>
      props.isActive &&
      css`
        flex-grow: 1;
        padding-top: 10px;
        padding-bottom: 10px;
      `}
  }
`;

const ICON_MARGIN = "10px";

export const SearchIcon = styled(Icon, { shouldForwardProp: isPropValid })<{
  isActive: boolean;
}>`
  flex-basis: 1rem;
  ${breakpointMaxSmall} {
    transition: margin 0.3s;

    ${(props) =>
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
  color: var(--mb-color-text-tertiary);
  cursor: pointer;

  &:hover {
    color: var(--mb-color-text-secondary);
  }
`;

export const SearchResultsFloatingContainer = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  color: var(--mb-color-text-primary);

  ${breakpointMaxSmall} {
    top: ${APP_BAR_HEIGHT};
  }

  ${breakpointMinSmall} {
    top: 42px;
  }
`;
