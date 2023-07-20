import styled from "@emotion/styled";
import LegendItem from "metabase/visualizations/components/LegendItem";

interface LegendHeaderItemProps {
  isBreakoutSeries?: boolean;
}

export const LegendHeaderItem = styled(LegendItem)<LegendHeaderItemProps>``;
