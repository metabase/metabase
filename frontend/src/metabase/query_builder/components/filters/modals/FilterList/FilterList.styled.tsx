import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const FilterListRoot = styled.div`
  margin-top: 1rem;
  margin-bottom: 1rem;
`;

export const FilterRow = styled.div`
  padding: 0.5rem 0;
`;

export const FilterLabel = styled.div`
  color: ${color("black")};
  font-weight: bold;
`;
