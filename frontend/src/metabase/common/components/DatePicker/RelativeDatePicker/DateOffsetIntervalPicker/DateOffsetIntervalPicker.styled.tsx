import styled from "@emotion/styled";
import { Box, Select } from "metabase/ui";
import type { BoxProps } from "metabase/ui";

export const PickerGrid = styled(Box)<BoxProps>`
  display: grid;
  grid-template-columns: repeat(4, auto);
  justify-content: center;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

export const FlexSelect = styled(Select)`
  flex: 1;
`;
