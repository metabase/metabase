import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import ColorPill from "metabase/core/components/ColorPill";
import ChartSettingColorPicker from "./ChartSettingColorPicker";

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
  color: ${color("text-dark")};
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

export const ColumnItemIcon = styled(Icon)`
  margin-left: 1rem;
  cursor: pointer;
  color: ${color("text-dark")};

  &:hover {
    color: ${color("text-medium")};
  }
`;

export const ColumnItemDragHandle = styled(Icon)`
  color: ${color("text-medium")};
`;

export const ColumnItemColorPicker = styled(ChartSettingColorPicker)`
  margin-bottom: 0;
  margin-left: 0.25rem;
  ${ColorPill.Root} {
    padding: 1px;
  }
  ${ColorPill.Content} {
    height: 0.875rem;
    width: 0.875rem;
  }
`;
