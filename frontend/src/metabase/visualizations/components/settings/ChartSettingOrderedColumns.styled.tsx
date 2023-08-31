import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import ColumnItem from "./ColumnItem";

export const SortableColumnItem = styled(ColumnItem)<{ disabled: boolean }>`
  ${ColumnItem.Button}, ${ColumnItem.DragHandle} {
    opacity: 0;
  }

  &:hover {
    ${ColumnItem.Button}, ${ColumnItem.DragHandle} {
      opacity: 1;
    }
  }

  [data-testid$="show-button"] {
    opactiy: 1;
  }

  ${ColumnItem.Container} {
    padding-left: 0.25rem;
  }

  ${ColumnItem.Content} {
    padding-left: 0;
  }

  ${({ disabled }) =>
    disabled &&
    `
    color: ${color("text-light")};
    [data-testid$="show-button"] {
      opacity: 1;
    }
    ${ColumnItem.Button}, ${ColumnItem.DragHandle} {
      color: ${color("text-light")};
    }
  `}
`;
