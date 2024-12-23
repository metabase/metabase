import styled from "@emotion/styled";

import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
import Link from "metabase/core/components/Link";
import { LegendLabel } from "metabase/visualizations/components/legend/LegendCaption.styled";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import StaticSkeleton from "metabase/visualizations/components/skeletons/StaticSkeleton";

export const CardActionMenuContainer = styled.div`
  position: absolute;
  top: 0.3125rem;
  right: 0.3125rem;
  z-index: 3;
  color: var(--mb-color-text-medium);
  visibility: hidden;
`;

export const CardStaticSkeleton = styled(StaticSkeleton)`
  padding: 0.5rem 1.5rem;
`;

export const CardPreviewSkeleton = styled(ChartSkeleton)`
  padding: 0.5rem 1rem;
`;

export interface CardRootProps {
  isPreview?: boolean;
}

export const CardRoot = styled(
  Link,
  doNotForwardProps("isPreview"),
)<CardRootProps>`
  position: relative;
  display: block;
  overflow: hidden;
  height: ${props => props.isPreview && "15.625rem"};
  padding: ${props => (props.isPreview ? "0" : "0.5rem 0")};
  border: 1px solid var(--mb-color-border);
  border-radius: 0.375rem;
  background-color: var(--mb-color-bg-white);

  &:hover {
    ${CardActionMenuContainer} {
      visibility: visible;
    }

    ${LegendLabel} {
      color: var(--mb-color-brand);
    }

    ${ChartSkeleton.Title} {
      color: var(--mb-color-brand);
    }

    ${ChartSkeleton.Description} {
      visibility: visible;
    }
  }

  .leaflet-container,
  .leaflet-container * {
    pointer-events: none !important;
  }
`;
