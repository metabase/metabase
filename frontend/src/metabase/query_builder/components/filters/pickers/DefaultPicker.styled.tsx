import { color } from "metabase/lib/colors";
import styled from "styled-components";

export const BetweenLayoutContainer = styled.div`
  display: flex;
  align-items: center;
  padding-bottom: 1rem;
`;

export const BetweenLayoutFieldContainer = styled.div`
  flex: 1 0;
  max-width: 190px;
`;

export const BetweenLayoutFieldSeparator = styled.div`
  padding: 0.5rem 0.5rem 0 0.5rem;
  font-weight: 700;
  color: ${color("text-medium")};
`;
