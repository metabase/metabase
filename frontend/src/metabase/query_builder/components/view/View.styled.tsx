import { css } from "@emotion/react";
import styled from "@emotion/styled";

import DebouncedFrame from "metabase/components/DebouncedFrame";
import { color } from "metabase/lib/colors";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import { breakpointMaxSmall } from "metabase/styled-components/theme/media-queries";

import { ViewTitleHeader } from "./ViewHeader";

export const QueryBuilderViewRoot = styled.div`
  display: flex;
  flex-direction: column;
  background-color: ${color("bg-white")};
  height: 100%;
  position: relative;
`;

export const QueryBuilderContentContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  position: relative;

  ${breakpointMaxSmall} {
    justify-content: end;
  }
`;

export const QueryBuilderMain = styled.main<{ isSidebarOpen: boolean }>`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  flex-basis: 0;

  ${breakpointMaxSmall} {
    ${props =>
      props.isSidebarOpen &&
      css`
        display: none !important;
      `};
    position: relative;
  }
`;

/**
 * The height of the header for the query builder view.
 * Currently hard coded based on the observation from the dev tools.
 * It prevents the header from jumping when the notebook view is toggled.
 *
 * If we want to calculate this heaight based on the children of the header,
 * we have to take into account the size of the buttons being used, as well as
 * their line-height + font size. We should add the padding and the border to that.
 *
 * @link https://github.com/metabase/metabase/issues/40334
 */
const headerHeight = "4rem";

export const BorderedViewTitleHeader = styled(ViewTitleHeader)`
  border-bottom: 1px solid ${color("border")};
  padding-top: 8px;
  padding-bottom: 8px;
  min-height: ${headerHeight};
`;

export const QueryBuilderViewHeaderContainer = styled.div`
  flex-shrink: 0;
  background-color: ${color("bg-white")};
  position: relative;
  z-index: 3;
`;

export const NativeQueryEditorContainer = styled.div`
  margin-bottom: 1rem;
  border-bottom: 1px solid ${color("border")};
  z-index: 2;
`;

export const StyledDebouncedFrame = styled(DebouncedFrame)`
  flex: 1 0 auto;
  flex-grow: 1;
`;

export const StyledSyncedParametersList = styled(SyncedParametersList)`
  margin-top: 1rem;
  margin-left: 1.5rem;
`;
