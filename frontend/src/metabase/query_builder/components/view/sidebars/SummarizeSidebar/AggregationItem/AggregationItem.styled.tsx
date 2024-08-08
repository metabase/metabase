import styled from "@emotion/styled";

import { color, alpha } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const Root = styled.button`
  display: flex;
  align-items: center;
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

export const AggregationName = styled.span`
  margin-left: 0.5rem;
  margin-right: 0.5rem;
`;

export const RemoveIcon = styled(Icon)`
  display: flex;
  margin-left: auto;
  opacity: 0.4;
  transition: opacity 0.3s;

  &:hover {
    opacity: 1;
  }
`;
