import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const FilterInputContainer = styled.div`
  padding: 0.75rem 1.5rem;
`;

export const ItemGroupsDivider = styled.hr`
  margin: 1rem 1.5rem;
  border: 0;
  border-top: 1px solid ${color("border")};
`;

export const EmptyStateContainer = styled.div`
  margin-top: 6.25rem;
`;
