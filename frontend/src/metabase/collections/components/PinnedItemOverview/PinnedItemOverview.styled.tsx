import styled from "styled-components";

import { breakpointMaxMedium } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1.15rem;

  ${breakpointMaxMedium} {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const SectionHeader = styled.div`
  padding-bottom: 1.15rem;
`;
