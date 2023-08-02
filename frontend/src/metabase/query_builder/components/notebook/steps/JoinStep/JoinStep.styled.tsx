import styled from "@emotion/styled";
import { alpha, color, darken } from "metabase/lib/colors";
import { Flex } from "metabase/ui";
import { NotebookCell } from "../../NotebookCell";

export const TablesNotebookCell = styled(NotebookCell)`
  flex: 1;
  align-self: start;
`;

export const ConditionContainer = styled(Flex)`
  background-color: ${color("brand")};
  border-radius: 8px;
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
  font-weight: 400;
  color: ${color("text-dark")};
`;

export const RemoveConditionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;

  cursor: pointer;

  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;

  border-left: 1px solid ${alpha(color("white"), 0.25)};

  transition: background-color 300ms linear;

  &:hover {
    background-color: ${darken("brand", 0.15)};
  }
`;
