import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space, breakpointMinSmall } from "metabase/styled-components/theme";

export const ListRoot = styled.div`
  margin-bottom: 1rem;
`;

export const ListRow = styled.div`
  padding: 1rem 2rem;
  border-bottom: 1px solid ${color("border")};
  &:last-of-type {
    border-bottom: none;
  }
  &:hover,
  :focus-within {
    background-color: ${color("bg-light")};
  }
`;

export const FilterContainer = styled.div`
  ${breakpointMinSmall} {
    display: grid;
    grid-template-columns: 1fr 2fr;
  }
  gap: 1rem;
  &:not(:last-of-type) {
    border-bottom: 1px solid ${color("border")};
    margin-bottom: ${space(2)};
    padding-bottom: ${space(2)};
  }
`;
