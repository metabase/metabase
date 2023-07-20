import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";
import LegendItem from "metabase/visualizations/components/LegendItem";

interface LegendHeaderItemProps {
  isBreakoutSeries?: boolean;
}

export const LegendHeaderItem = styled(LegendItem)<LegendHeaderItemProps>`
  &:hover {
    color: ${props => !props.isBreakoutSeries && color("brand")};
  }
`;

export const AddSeriesIcon = styled(Icon)`
  color: ${color("text-medium")};
  flex-shrink: 0;
  margin: 0 0.5rem;
  padding: 0.3125rem;
  border-radius: 0.5rem;
  background-color: ${color("bg-medium")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
