// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { LegendCaption } from "./legend/LegendCaption";

interface ChartCaptionRootProps {
  visualizationType?: string;
}

export const ChartCaptionRoot = styled(LegendCaption)<ChartCaptionRootProps>`
  margin: 0 0.5rem;
  flex-shrink: 0;
`;
