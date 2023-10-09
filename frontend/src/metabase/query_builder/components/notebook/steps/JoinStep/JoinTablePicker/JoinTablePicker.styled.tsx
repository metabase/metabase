import styled from "@emotion/styled";
import { css } from "@emotion/react";
import IconButtonWrapper from "metabase/components/IconButtonWrapper/IconButtonWrapper";
import { color } from "metabase/lib/colors";
import { NotebookCell, NotebookCellItem } from "../../../NotebookCell";

export const PickerButton = styled.button`
  color: inherit;
  font-weight: inherit;
  cursor: ${props => (props.disabled ? "auto" : "pointer")};
`;

export const ColumnPickerButton = styled(IconButtonWrapper)`
  padding: ${NotebookCell.CONTAINER_PADDING};
  opacity: 0.5;
  color: ${color("white")};
`;

export const PickerNotebookCellItem = styled(NotebookCellItem)<{
  canChangeTable?: boolean;
}>`
  ${NotebookCellItem.Content} {
    pointer-events: ${props => (props.canChangeTable ? "auto" : "none")};
  }

  ${props =>
    !props.inactive &&
    css`
      &:hover {
        ${NotebookCellItem.Content} {
          background-color: ${props.color};
        }
      }
    `}
`;
