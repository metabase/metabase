import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper/IconButtonWrapper";
import { color } from "metabase/lib/colors";

import { NotebookCell } from "../../../NotebookCell";

export const ColumnPickerButton = styled(IconButtonWrapper)`
  padding: ${NotebookCell.CONTAINER_PADDING};
  opacity: 0.5;
  color: ${color("white")};
`;
