import styled from "@emotion/styled";
import { Icon } from "metabase/core/components/Icon";
import QueryColumnPicker from "metabase/common/components/QueryColumnPicker/QueryColumnPicker";
import { color } from "metabase/lib/colors";
import { NotebookCellItem } from "../../../NotebookCell";

export const JoinConditionCellItem = styled(NotebookCellItem)<{
  readOnly?: boolean;
}>`
  cursor: ${props => (props.readOnly ? "default" : "pointer")};
`;

export const StyledQueryColumnPicker = styled(QueryColumnPicker)`
  color: ${color("brand")};
`;

export const RemoveIcon = styled(Icon)`
  color: ${color("text-white")};
  opacity: 0.65;
`;
