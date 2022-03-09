import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const CardToggle = styled.div`
  display: flex;
`;

export const CardTitle = styled.span`
  margin-left: 0.5rem;
  color: ${color("text-dark")};
  font-weight: bold;
  font-size: 0.875rem;
`;
