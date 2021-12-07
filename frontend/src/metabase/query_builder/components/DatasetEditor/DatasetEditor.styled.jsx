import styled, { css } from "styled-components";
import EditBar from "metabase/components/EditBar";
import { color } from "metabase/lib/colors";
import { breakpointMinSmall, space } from "metabase/styled-components/theme";

export const DatasetEditBar = styled(EditBar)`
  background-color: ${color("nav")};
`;

export const TableHeaderColumnName = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  min-width: 35px;

  margin: 24px 0.75em;
  padding: ${space(0)} ${space(1)};

  white-space: nowrap;
  text-overflow: ellipsis;
  overflow-x: hidden;

  color: ${color("brand")};
  background-color: transparent;
  font-weight: bold;
  cursor: pointer;

  border: 1px solid ${color("brand")};
  border-radius: 8px;

  ${props =>
    props.isSelected &&
    css`
      color: ${color("text-white")};
      background-color: ${color("brand")};
    `}

  .Icon {
    margin-right: 4px;
  }
`;

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
  z-index: 2;
  width: 100%;

  ${props =>
    props.isResizable &&
    css`
      margin-bottom: 1rem;
      border-bottom: 1px solid ${color("border")};
    `}
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
