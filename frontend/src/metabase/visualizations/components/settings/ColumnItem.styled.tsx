import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

export const ColumnItemRoot = styled.div`
  margin: 0.5rem 0;
  overflow: hidden;
  display: flex;
  align-items: center;

  ${props =>
    props.draggable &&
    `
    cursor: grab;
    &:hover {
      ${ColumnItemDragHandle} {
        opacity: 1;
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
  font-size: 0.75rem;
  line-height: 1rem;
  flex: auto;
  color: ${color("text-dark")};
`;

export const ColumnItemContent = styled.div`
  padding: 0 0.5rem;
  position: relative;
  align-items: center;
  display: flex;
`;

export const ColumnItemContainer = styled.div`
  padding: 0.5rem;
  position: relative;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  flex: auto;
`;

export const ColumnItemIcon = styled(Icon)`
  margin-left: 1rem;
  cursor: pointer;
  color: ${color("text-dark")};
  fill-rule: evenodd;

  &:hover {
    color: ${color("text-medium")};
  }
`;

export const ColumnItemDragHandle = styled(Icon)`
  opacity: 0;
  margin-right: 0.5rem;
  color: ${color("text-medium")};
`;
