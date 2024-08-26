import styled from "@emotion/styled";

import type { BoxProps } from "metabase/ui";
import { Box } from "metabase/ui";

export const PickerGrid = styled(Box)<BoxProps>`
  display: grid;
  grid-template-columns: repeat(4, auto);
  justify-content: center;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;
