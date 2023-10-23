import styled from "@emotion/styled";
import { alpha, color, lighten } from "metabase/lib/colors";
import { Flex } from "metabase/ui";
import { NotebookCell } from "../../NotebookCell";

export const TablesNotebookCell = styled(NotebookCell)`
  flex: 1;
  align-self: start;
`;

export const ConditionContainer = styled(Flex)<{ isComplete: boolean }>`
  border-radius: 8px;
  transition: background-color 300ms linear;

  background-color: ${props =>
    props.isComplete ? color("brand") : alpha("brand", 0.15)};
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

export const RemoveConditionButton = styled.button<{
  isConditionComplete: boolean;
}>`
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

  color: ${props =>
    props.isConditionComplete ? color("white") : color("brand")};

  &:hover,
  &:focus {
    background-color: ${props =>
      props.isConditionComplete ? lighten("brand", 0.1) : alpha("brand", 0.2)};
  }
`;
