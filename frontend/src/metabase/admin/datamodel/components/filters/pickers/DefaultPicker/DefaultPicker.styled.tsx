import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

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

export const DefaultPickerContainer = styled.div`
  max-height: 300px;
  overflow-x: hidden;
  overflow-y: auto;
`;
