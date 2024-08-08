import { css } from "@emotion/react";
import styled from "@emotion/styled";

import EditBar from "metabase/components/EditBar";
import { color } from "metabase/lib/colors";
import { breakpointMinSmall, space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const TabHintToastContainer = styled.div<{ isVisible: boolean }>`
  position: fixed;
  bottom: 16px;
  left: 24px;
  transform: translateY(200%);
  transition: all 0.4s;
  ${props =>
    props.isVisible &&
    css`
      transform: translateY(0);
    `}
`;

export const DatasetEditBar = styled(EditBar)`
  background-color: ${color("brand")};
`;

export const TableHeaderColumnName = styled.div<{ isSelected: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  min-width: 35px;
  margin: 24px 0.75em;
  padding: 3px ${space(1)};
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow-x: hidden;
  color: ${color("brand")};
  background-color: transparent;
  font-weight: bold;
  cursor: pointer;
  border: 1px solid ${color("brand")};
  border-radius: 8px;
  transition: all 0.25s;

  ${props =>
    props.isSelected &&
    css`
      color: ${color("text-white")};
      background-color: ${color("brand")};
    `}

  .Icon {
    margin-right: 8px;
    transition: all 0.25s;
  }

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};

    .Icon {
      background-color: ${color("white")};
      color: ${color("brand")};
    }
  }
`;

export const FieldTypeIcon = styled(Icon)<{ isSelected: boolean }>`
  background-color: ${props =>
    props.isSelected ? color("white") : color("brand")};
  color: ${props => (props.isSelected ? color("brand") : color("white"))};
  border-radius: 0.3em;
  padding: 0.2em;
`;

FieldTypeIcon.defaultProps = { size: 14 };

// Mirrors styling of some QB View div elements

const EDIT_BAR_HEIGHT = "49px";

export const Root = styled.div`
  display: flex;
  flex: 1 0 auto;
  position: relative;
  background-color: ${color("bg-white")};
  height: calc(100vh - ${EDIT_BAR_HEIGHT});
`;

export const MainContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  flex-basis: 0;
  position: relative;
`;

export const QueryEditorContainer = styled.div<{ isResizable: boolean }>`
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

export const TableContainer = styled.div<{ isSidebarOpen: boolean }>`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  flex-basis: 0;

  ${props => props.isSidebarOpen && tableVisibilityStyle}
`;
