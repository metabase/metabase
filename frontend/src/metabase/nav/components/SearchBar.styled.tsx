import styled from "@emotion/styled";

import Icon from "metabase/components/Icon";

import { APP_BAR_HEIGHT } from "metabase/nav/constants";

import { color } from "metabase/lib/colors";

import {
  breakpointMaxSmall,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const SearchInputContainer = styled.div`
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  position: relative;
  max-width: 50em;

  background-color: ${color("bg-light")};
  border: 1px solid ${color("border")};
  border-radius: 6px;

  transition: background 150ms;

  &:hover {
    background-color: ${color("bg-medium")};
  }
`;

export const SearchInput = styled.input`
  width: 100%;
  padding: 10px 12px;
  font-weight: 700;

  color: ${color("text-dark")};
  background-color: transparent;
  border: none;

  &:focus {
    outline: none;
  }
  &::placeholder {
    color: ${color("text-dark")};
  }
`;

const ICON_MARGIN = "10px";

export const SearchIcon = styled(Icon)`
  margin-left: ${ICON_MARGIN};
`;

export const ClearIconButton = styled.button`
  position: absolute;
  top: ${ICON_MARGIN};
  right: ${ICON_MARGIN};

  color: ${color("text-light")};

  padding: 0.5em;
  margin: -0.5em;

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
    max-width: ;
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
