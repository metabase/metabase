import styled from "@emotion/styled";

import { NotebookCell } from "../../../NotebookCell";

export const JoinNotebookCell = styled(NotebookCell)`
  flex: 1;
  align-self: start;
`;

export const JoinConditionNotebookCell = styled(NotebookCell)`
  flex: 1;
  flex-direction: column;
  align-items: start;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
`;
