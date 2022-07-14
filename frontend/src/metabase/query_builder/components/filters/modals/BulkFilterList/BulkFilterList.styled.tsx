import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Ellipsified from "metabase/core/components/Ellipsified";

export const ListRoot = styled.div`
  margin-bottom: 1rem;
`;

export const ListRow = styled.div`
  padding: 2.5rem 2rem;
  border-bottom: 1px solid ${color("border")};
  &:last-of-type {
    border-bottom: none;
  }
`;

export const ListRowLabel = styled(Ellipsified)`
  padding: 0.625rem 1rem 0.625rem 0;
  color: ${color("black")};
  line-height: 1rem;
  font-weight: bold;
`;

export const FilterDivider = styled.div`
  grid-column: 2;
  border-top: 1px solid ${color("border")};
  margin: ${space(2)} 0;
  &:last-of-type {
    margin: 0;
    display: none;
  }
`;
