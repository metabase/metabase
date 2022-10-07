import styled from "@emotion/styled";
import { color, lighten } from "metabase/lib/colors";
import ColumnItem from "./ColumnItem";

interface FieldPartitionColumnProps {
  isDisabled: boolean;
}

export const FieldPartitionColumn = styled(
  ColumnItem,
)<FieldPartitionColumnProps>`
  padding: 0.25rem 0;
  margin: 0;

  ${props =>
    props.isDisabled &&
    `
        pointer-events: none;
        opacity: 0.4;
      `}
`;

interface DroppableContainerProps {
  isDraggingOver: boolean;
  isDragSource: boolean;
}

export const DroppableContainer = styled.div<DroppableContainerProps>`
  background-color: ${({ isDraggingOver, isDragSource }) =>
    isDraggingOver
      ? lighten("brand")
      : isDragSource
      ? color("border")
      : "none"};
  border-radius: 0.5rem;
`;
