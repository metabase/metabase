import styled from "@emotion/styled";

import { color, alpha } from "metabase/lib/colors";

export const AggregationItemRoot = styled.button`
  display: inline-flex;
  align-items: center;
  margin: 0 0.5rem 0.5rem 0;
  padding: 0.5rem;
  font-weight: bold;
  border-radius: 6px;
  color: ${color("white")};
  background-color: ${color("summarize")};
  transition: background 300ms linear, border 300ms linear;
  min-height: 34px;
  min-width: 34px;
  cursor: pointer;

  &:hover {
    background-color: ${alpha("summarize", 0.8)};
    border-color: ${alpha("summarize", 0.8)};
  }
`;
