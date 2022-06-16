import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const DimensionListTableName = styled.div`
  margin: 1rem 0 0.5rem 0;
  text-transform: uppercase;
  font-weight: 700;
  font-size: 0.75rem;
  padding: 0 0.5rem;
  color: ${color("summarize")};
`;

export const DimensionListFilterContainer = styled.div`
  margin-bottom: 1rem;
`;
