import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";
import ActionMenu from "metabase/collections/components/ActionMenu";
import ChartSkeleton from "metabase/visualizations/components/ChartSkeleton";

export const CardActionMenu = styled(ActionMenu)`
  position: absolute;
  top: 0.3125rem;
  right: 0.3125rem;
  z-index: 3;
  color: ${color("text-medium")};
  visibility: hidden;
`;

export const CardSkeleton = styled(ChartSkeleton)`
  padding: 0.5rem 1rem;
`;

export const CardRoot = styled(Link)`
  position: relative;
  display: block;
  height: 15.625rem;
  padding: 0.5rem 0;
  border: 1px solid ${color("border")};
  border-radius: 0.375rem;
  background-color: ${color("white")};

  &:hover {
    ${CardActionMenu} {
      visibility: visible;
    }

    ${ChartSkeleton.Title} {
      color: ${color("brand")};
    }

    ${ChartSkeleton.Description} {
      visibility: visible;
    }
  }
`;
