import styled from "@emotion/styled";

import { color, alpha } from "metabase/lib/colors";

export const MigrationCard = styled.div`
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  padding: 2rem 3rem;
`;

export const LargeIconContainer = styled.div<{
  color: string;
}>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 4rem;
  width: 4rem;
  border-radius: 50%;
  background: ${props => alpha(props.color, 0.15)};
  color: ${props => props.color};
`;
