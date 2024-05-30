import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

import { NotebookCell } from "../../NotebookCell";

export const DataStepIconButton = styled(IconButtonWrapper)`
  color: var(--mb-color-text-white);
  padding: ${NotebookCell.CONTAINER_PADDING};
  opacity: 0.5;
`;
