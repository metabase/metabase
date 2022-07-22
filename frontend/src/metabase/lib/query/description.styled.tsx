import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const MetricClause = styled.span`
  color: ${color("summarize")};
  font-weight: 700;
`;

export const FilterClause = styled.span`
  color: ${color("filter")};
  font-weight: 700;
`;
