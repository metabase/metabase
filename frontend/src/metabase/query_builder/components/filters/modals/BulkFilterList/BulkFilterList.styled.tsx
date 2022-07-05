import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Ellipsified from "metabase/core/components/Ellipsified";

export const ListRoot = styled.div`
  margin-top: 1rem;
  margin-bottom: 1rem;
`;

export const ListRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: ${space(2)};
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${color("border")};
  &:last-child {
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
  &:last-child {
    display: none;
  }
`;
