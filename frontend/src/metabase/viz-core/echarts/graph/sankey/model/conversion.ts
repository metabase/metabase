import Color from "color";
import _ from "underscore";

import type { RowValue } from "metabase-types/api";

import { getLinearColorScale } from "../../../../lib/color-scales";

import type {
  SankeyData,
  SankeyLink,
  SankeyNode,
  SankeyNodeConversion,
} from "./types";

// A rate this many times its step's average, or this many times below it, gets the strongest color.
const SATURATING_LIFT = 2;
// Steps of the scale on each side of neutral, so the colors stay a small fixed set.
const SCALE_STEPS = 3;

export type ConversionColors = {
  neutral: string;
  converted: string;
  dropped: string;
};

type Counts = { people: number; converted: number };

const getRate = ({ people, converted }: Counts) =>
  people > 0 ? converted / people : 0;

/** A color from neutral (average) to converted (above) or dropped (below). */
export const getConversionColor = (
  lift: number | undefined,
  colors: ConversionColors,
): string => {
  if (lift === undefined || lift <= 0) {
    return lift === 0 ? colors.dropped : colors.neutral;
  }
  const position = Math.log(lift) / Math.log(SATURATING_LIFT);
  const step = Math.round(Math.max(-1, Math.min(1, position)) * SCALE_STEPS);
  const scale = getLinearColorScale(
    [-SCALE_STEPS, SCALE_STEPS],
    [colors.dropped, colors.neutral, colors.converted],
  );
  return Color(scale(step)).hex();
};

/** Every color the scale can produce, for the tooltip markers. */
export const getConversionScale = (colors: ConversionColors): string[] =>
  _.range(-SCALE_STEPS, SCALE_STEPS + 1).map((step) =>
    getConversionColor(SATURATING_LIFT ** (step / SCALE_STEPS), colors),
  );

const sumCounts = (
  links: readonly SankeyLink[],
  convertedValue: RowValue,
): Counts =>
  links.reduce(
    (counts, link) => {
      const people = typeof link.value === "number" ? link.value : 0;
      return {
        people: counts.people + people,
        converted:
          counts.converted +
          (link.breakoutValue === convertedValue ? people : 0),
      };
    },
    { people: 0, converted: 0 },
  );

/**
 * How many people at each node went on to convert, from links split by an
 * outcome breakout. Each node's lift compares it with the rest of its column
 * that's still on its way, since people who already converted or dropped off
 * have left the chart. Outcome nodes, and nodes that are their whole step, get no lift.
 */
export const getSankeyConversion = ({
  data,
  convertedValue,
  isOutcome,
  colors,
}: {
  data: SankeyData;
  convertedValue: RowValue;
  isOutcome: (node: SankeyNode) => boolean;
  colors: ConversionColors;
}): Map<RowValue, SankeyNodeConversion> => {
  const incoming = _.groupBy(data.links, (link) =>
    String(link.targetNode.rawName),
  );
  const outgoing = _.groupBy(data.links, (link) =>
    String(link.sourceNode.rawName),
  );
  const countsByNode = new Map(
    data.nodes.map((node) => {
      const inflow = sumCounts(
        incoming[String(node.rawName)] ?? [],
        convertedValue,
      );
      // A path's first node has no inflow, so its people are its outflow.
      return [
        node,
        inflow.people > 0
          ? inflow
          : sumCounts(outgoing[String(node.rawName)] ?? [], convertedValue),
      ];
    }),
  );
  const getCounts = (node: SankeyNode) =>
    countsByNode.get(node) ?? { people: 0, converted: 0 };

  const columnTotals = new Map<number, Counts>();
  data.nodes
    .filter((node) => !isOutcome(node))
    .forEach((node) => {
      const total = columnTotals.get(node.level) ?? { people: 0, converted: 0 };
      const counts = getCounts(node);
      columnTotals.set(node.level, {
        people: total.people + counts.people,
        converted: total.converted + counts.converted,
      });
    });

  const nodeOrder = new Map(data.nodes.map((node, index) => [node, index]));

  return new Map(
    data.nodes.map((node) => {
      const counts = getCounts(node);
      const rate = getRate(counts);
      const column = columnTotals.get(node.level);
      const columnRate = column !== undefined ? getRate(column) : 0;
      const hasLift =
        !isOutcome(node) &&
        column !== undefined &&
        columnRate > 0 &&
        // A node that is its whole step has nothing to be compared with.
        counts.people < column.people;

      const nextSteps = _.sortBy(
        Object.values(
          _.groupBy(outgoing[String(node.rawName)] ?? [], (link) =>
            String(link.targetNode.rawName),
          ),
        ),
        (links) => nodeOrder.get(links[0].targetNode) ?? 0,
      ).map((links) => {
        const next = sumCounts(links, convertedValue);
        const nextRate = getRate(next);
        const nextLift = rate > 0 ? nextRate / rate : undefined;
        return {
          node: links[0].targetNode,
          ...next,
          rate: nextRate,
          color: getConversionColor(nextLift, colors),
        };
      });

      return [
        node.rawName,
        {
          ...counts,
          rate,
          lift: hasLift ? rate / columnRate : undefined,
          nextSteps,
        },
      ];
    }),
  );
};
