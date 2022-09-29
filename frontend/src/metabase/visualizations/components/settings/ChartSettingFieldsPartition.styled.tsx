import styled from "@emotion/styled";
import ColumnItem from "./ColumnItem";

interface FieldPartitionColumnProps {
  isDisabled: boolean;
}

export const FieldPartitionColumn = styled(
  ColumnItem,
)<FieldPartitionColumnProps>`
  padding: 0.25rem 0;

  ${props =>
    props.isDisabled &&
    `
        pointer-events: none;
        opacity: 0.4;
      `}
`;
