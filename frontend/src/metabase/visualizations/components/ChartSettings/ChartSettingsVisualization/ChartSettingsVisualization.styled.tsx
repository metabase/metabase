import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import Warnings from "metabase/query_builder/components/Warnings";

export const SectionWarnings = styled(Warnings)`
  color: ${() => color("accent4")};
  position: absolute;
  top: 2rem;
  right: 2rem;
  z-index: 2;
`;

export const ChartSettingsPreview = styled.div`
  flex: 2 0 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--mb-color-border);
  padding-top: 1.5rem;
`;

export const ChartSettingsVisualizationContainer = styled.div`
  position: relative;
  margin: 0 2rem;
  flex-grow: 1;
`;
