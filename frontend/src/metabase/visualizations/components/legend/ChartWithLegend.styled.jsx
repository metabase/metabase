import styled from "styled-components";
import { space } from "metabase/styled-components/theme";

export const ChartWithLegendRoot = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  padding: ${space(2)};
  min-height: 0;
`;
