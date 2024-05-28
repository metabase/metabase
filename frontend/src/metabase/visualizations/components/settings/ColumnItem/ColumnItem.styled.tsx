import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import { ChartSettingColorPicker } from "../ChartSettingColorPicker";

interface ColumnItemRootProps {
  isDraggable: boolean;
}

export const ColumnItemRoot = styled.div<ColumnItemRootProps>`
  margin: 0.5rem 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  background: ${color("white")};

  &.dragging {
    cursor: grabbing;
    pointer-events: auto !important;
  }

  color: ${color("text-medium")};

  ${props =>
    props.isDraggable &&
    `
    cursor: grab;
    &:hover {
      ${ColumnItemDragHandle} {
        color: ${color("brand")};
      }
    }
    `}
  ${props => (props.onClick ? "cursor: pointer;" : "")}
`;

export const ColumnItemSpan = styled.span`
  word-break: break-word;
  word-wrap: anywhere;
  font-weight: 700;
  margin: 0;
  font-size: 0.875rem;
  line-height: 1rem;
  flex: auto;
  display: inline-flex;
  gap: 0.25rem;
`;

export const ColumnItemContent = styled.div`
  padding: 0 0.5rem;
  position: relative;
  align-items: center;
  display: flex;
  flex: auto;
`;

export const ColumnItemContainer = styled.div`
  padding: 0.75rem 0.5rem;
  position: relative;
  flex: auto;
  display: flex;
  align-items: center;
`;

export const ColumnItemIcon = styled(Button)`
  margin-left: 1rem;
  padding: 0;

  &:hover {
    background-color: unset;
  }
`;

export const ColumnItemDragHandle = styled(Icon)`
  flex-shrink: 0;
`;

export const ColumnItemColorPicker = styled(ChartSettingColorPicker)`
  margin-bottom: 0;
  margin-left: 0.25rem;
`;
