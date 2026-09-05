// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import type { DashcardSizeTier } from "metabase/visualizations/lib/dashcard-sizing";

import { LegendCaption } from "./legend/LegendCaption";

export const ChartCaptionRoot = styled(LegendCaption)<{
  sizeTier?: DashcardSizeTier;
}>`
  margin: ${({ sizeTier }) => (sizeTier ? "0" : "0 0.5rem")};
  flex-shrink: 0;
`;
