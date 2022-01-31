import styled from "styled-components";

import { color } from "metabase/lib/colors";
import { breakpointMaxMedium } from "metabase/styled-components/theme";

export const GAP_REM = 1.15;

export const Container = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${GAP_REM}rem;
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: ${GAP_REM}rem;

  ${breakpointMaxMedium} {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const SectionHeader = styled.div`
  padding-bottom: 1.15rem;
  margin-top: 1.5rem;
`;

export const SectionSubHeader = styled.div`
  color: ${color("text-medium")};
  padding-top: 0.5rem;
`;
