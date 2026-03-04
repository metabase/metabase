// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Warnings } from "metabase/query_builder/components/Warnings";

export const SectionWarnings = styled(Warnings)`
  color: ${() => color("accent4")};
  position: absolute;
  top: 2rem;
  right: 2rem;
  z-index: 2;
`;

export const ChartSettingsVisualizationContainer = styled.div`
  position: relative;
  margin: 0 2rem;
  flex-grow: 1;
`;
