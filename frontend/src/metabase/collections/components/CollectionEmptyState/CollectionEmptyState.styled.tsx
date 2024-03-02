import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const EmptyStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const EmptyStateTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.5rem;
  font-weight: bold;
  line-height: 2rem;
  margin-top: 2.5rem;
  margin-bottom: 0.75rem;
`;

export const EmptyStateIconForeground = styled.path`
  fill: ${color("bg-light")};
  stroke: ${color("brand")};
`;

export const EmptyStateIconBackground = styled.path`
  fill: ${color("brand-light")};
  stroke: ${color("brand")};
`;
