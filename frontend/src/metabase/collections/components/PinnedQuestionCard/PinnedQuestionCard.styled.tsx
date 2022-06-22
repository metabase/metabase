import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";
import ActionMenu from "metabase/collections/components/ActionMenu";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import StaticSkeleton from "metabase/visualizations/components/skeletons/StaticSkeleton";
import { LegendLabel } from "metabase/visualizations/components/legend/LegendCaption.styled";

export const CardActionMenu = styled(ActionMenu)`
  position: absolute;
  top: 0.3125rem;
  right: 0.3125rem;
  z-index: 3;
  color: ${color("text-medium")};
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

export const CardRoot = styled(Link)<CardRootProps>`
  position: relative;
  display: block;
  height: ${props => props.isPreview && "15.625rem"};
  padding: 0.5rem 0;
  border: 1px solid ${color("border")};
  border-radius: 0.375rem;
  background-color: ${color("white")};

  &:hover {
    ${CardActionMenu} {
      visibility: visible;
    }

    ${LegendLabel} {
      color: ${color("brand")};
    }

    ${ChartSkeleton.Title} {
      color: ${color("brand")};
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
