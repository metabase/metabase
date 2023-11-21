import styled from "@emotion/styled";
import { Checkbox } from "metabase/ui";

export const CheckboxGrid = styled(Checkbox.Group)<{ rows: number }>`
  display: grid;
  grid-auto-flow: column;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: ${({ rows }) => `repeat(${rows}, 1fr)`};
  gap: 1rem;
`;
