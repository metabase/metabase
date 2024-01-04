import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";

export const FilterPillRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: bold;
  cursor: pointer;
  padding: 0 0.5rem;
  color: ${color("filter")};
  background-color: ${alpha("filter", 0.2)};
`;
