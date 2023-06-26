import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color, alpha } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";
import { DimensionPicker } from "metabase/query_builder/components/DimensionPicker";

export const SubDimensionButton = styled.button`
  text-align: left;
  display: flex;
  align-items: center;
  height: 100%;
  padding-left: 0.5rem;
  border-left: 1px solid transparent;
  visibility: hidden;
  cursor: pointer;
  font-weight: 700;
`;

export const SubDimensionPicker = styled(DimensionPicker)`
  color: ${color("summarize")};
  overflow-y: auto;
`;

export const DimensionListItemTag = styled.div`
  font-size: 0.75rem;
  padding: 0 0.5rem;
  color: ${color("text-light")};
`;

export const DimensionListItemContent = styled.div`
  display: flex;
  flex: auto;
  align-items: center;
  border-radius: 6px;
  padding-right: 0.5rem;
`;

export const DimensionListItemTitleContainer = styled.div`
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
  padding: 0.5rem 0;
  flex-grow: 1;
`;

export const DimensionListItemRemoveButton = styled.button`
  display: flex;
  margin-left: 1rem;
  opacity: 0.6;
  transition: all 100ms;
  color: ${color("white")};
  cursor: pointer;

  &:hover {
    opacity: 1;
  }
`;

export const DimensionListItemAddButton = styled.button`
  display: flex;
  align-items: center;
  align-self: stretch;
  justify-content: center;
  width: 34px;
  margin-left: 0.5rem;
  border-radius: 6px;
  color: ${color("white")};
  cursor: pointer;
`;

export const DimensionListItemIcon = styled(Icon)`
  color: ${color("text-medium")};
`;

export const DimensionListItemTitle = styled.div`
  margin: 0 0.5rem;
  word-break: break-word;
  font-size: 0.875rem;
  font-weight: 700;
`;

const selectedStyle = css`
  ${DimensionListItemContent},
  ${DimensionListItemIcon} {
    background-color: ${color("summarize")};
    color: ${color("white")};
  }

  ${SubDimensionButton} {
    visibility: visible;
    color: ${alpha("white", 0.5)};
    border-color: ${alpha("text-dark", 0.1)};
  }

  ${SubDimensionButton}:hover {
    color: ${color("white")};
  }

  ${DimensionListItemTag} {
    color: ${alpha("white", 0.6)};
  }
`;

const unselectedStyle = css`
  &:hover {
    ${DimensionListItemIcon},
    ${DimensionListItemContent},
    ${DimensionListItemAddButton} {
      color: ${color("summarize")};
      background-color: ${color("bg-light")};
    }

    ${DimensionListItemAddButton}:hover {
      background-color: ${color("bg-medium")};
    }

    ${SubDimensionButton} {
      visibility: visible;
      color: ${color("text-light")};
      border-color: ${color("border")};
    }

    ${SubDimensionButton}:hover {
      color: ${color("text-medium")};
    }
  }
`;

export const DimensionListItemRoot = styled.li`
  display: flex;
  align-items: stretch;
  cursor: pointer;
  margin: 0.25rem 0;
  min-height: 34px;

  ${props => (props.isSelected ? selectedStyle : unselectedStyle)}
`;
