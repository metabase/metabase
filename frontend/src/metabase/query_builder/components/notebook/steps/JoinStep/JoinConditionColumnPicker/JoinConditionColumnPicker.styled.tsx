import styled from "@emotion/styled";
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
