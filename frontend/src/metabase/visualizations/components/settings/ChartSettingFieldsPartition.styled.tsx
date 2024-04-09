import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import { ColumnItem } from "./ColumnItem";

interface FieldPartitionColumnProps {
  isDisabled: boolean;
}

export const FieldPartitionColumn = styled(
  ColumnItem,
)<FieldPartitionColumnProps>`
  margin: 0;

  ${props =>
    props.isDisabled &&
    `
        pointer-events: none;
        opacity: 0.4;
      `}
`;

interface DroppableContainerProps {
  isDragSource: boolean;
}

export const DroppableContainer = styled.div<DroppableContainerProps>`
  background-color: ${({ isDragSource }) =>
    isDragSource ? color("border") : "none"};
  border-radius: 0.5rem;
  min-height: 40px;
  position: relative;
`;

export const EmptyColumnPlaceholder = styled.div`
  position: absolute;
  width: 100%;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
  color: ${color("text-medium")};
`;
