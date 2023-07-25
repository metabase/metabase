import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper/IconButtonWrapper";
import { NotebookCell } from "../../NotebookCell";

export const TablesNotebookCell = styled(NotebookCell)`
  flex: 1;
  align-self: start;
`;

export const ConditionNotebookCell = styled(NotebookCell)`
  flex: 1;
  flex-direction: column;
  align-items: start;
  justify-content: center;
  gap: 8px;

  padding: 8px;
`;

export const ConditionUnionLabel = styled.span`
  display: block;
  color: ${color("text-medium")};
  font-weight: bold;
  margin-left: 4px;
`;

export const RemoveConditionButton = styled(IconButtonWrapper)`
  margin-left: 8px;

  color: ${color("text-light")};

  &:hover {
    color: ${color("text-medium")};
  }
`;
