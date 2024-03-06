import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";
import LegendItem from "metabase/visualizations/components/LegendItem";

interface LegendHeaderItemProps {
  isBreakoutSeries?: boolean;
}

export const LegendHeaderItem = styled(LegendItem)<LegendHeaderItemProps>`
  &:hover {
    color: ${props => !props.isBreakoutSeries && color("brand")};
  }
`;
