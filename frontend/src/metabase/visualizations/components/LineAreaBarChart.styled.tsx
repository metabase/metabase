import styled from "@emotion/styled";
import _ from "underscore";

import { MAX_SERIES } from "metabase/visualizations/lib/utils";

import LegendCaption from "./legend/LegendCaption";

const getMuteSeriesClass = (i: number) => [
  `&.mute-${i} svg.stacked .stack._${i} .area`,
  `&.mute-${i} svg.stacked .stack._${i} .line`,
  `&.mute-${i} svg.stacked .stack._${i} .bar`,
  `&.mute-${i} svg.stacked .dc-tooltip._${i} .dot`,
  `&.mute-${i} svg:not(.stacked) .sub._${i} .bar`,
  `&.mute-${i} svg:not(.stacked) .sub._${i} .line`,
  `&.mute-${i} svg:not(.stacked) .sub._${i} .dot`,
  `&.mute-${i} svg:not(.stacked) .sub._${i} .bubble`,
  `&.mute-${i} svg:not(.stacked) .row`,
];

const getMuteSeriesSelector = () => {
  return _.range(MAX_SERIES).flatMap(getMuteSeriesClass).join(",");
};

export const LineAreaBarChartRoot = styled.div<{ isQueryBuilder: boolean }>`
  display: flex;
  flex-direction: column;
  padding: ${({ isQueryBuilder }) =>
    isQueryBuilder ? "1rem 1rem 1rem 2rem" : "0.5rem 1rem"};
  overflow: hidden;

  ${getMuteSeriesSelector()} {
    opacity: 0.25;
  }
`;

export const ChartLegendCaption = styled(LegendCaption)`
  flex: 0 0 auto;
  margin-bottom: 0.5rem;
`;
