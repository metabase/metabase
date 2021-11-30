import styled, { css } from "styled-components";
import { color } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";

// Mirrors styling of some QB View div elements

export const Root = styled.div`
  display: flex;
  flex: 1 0 auto;
  position: relative;
  background-color: ${color("bg-white")};
`;

export const MainContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  position: relative;
`;

export const QueryEditorContainer = styled.div`
  margin-bottom: 1rem;
  border-bottom: 1px solid ${color("border")};
  z-index: 2;
  width: 100%;
`;

const tableVisibilityStyle = css`
  display: none;

  ${breakpointMinSmall} {
    display: inherit;
  }
`;

export const TableContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  flex-basis: 0;

  ${props => props.isSidebarOpen && tableVisibilityStyle}
`;
