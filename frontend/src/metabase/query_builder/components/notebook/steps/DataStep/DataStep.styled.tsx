import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

import { NotebookCell } from "../../NotebookCell";

export const DataStepCell = styled.div`
  padding: ${NotebookCell.CONTAINER_PADDING};
`;

export const DataStepIconButton = styled(IconButtonWrapper)`
  color: ${color("white")};
  padding: ${NotebookCell.CONTAINER_PADDING};
  opacity: 0.5;
`;
