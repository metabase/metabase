import { SingleSeries, Series } from "../dataset";
import { Card } from "../card";
import { createMockCard } from "./card";
import { createMockDataset, MockDatasetOpts } from "./dataset";

export const createMockSingleSeries = (
  cardOpts: Partial<Card>,
  dataOpts: MockDatasetOpts = {},
): SingleSeries => {
  return {
    card: createMockCard(cardOpts),
    ...createMockDataset(dataOpts),
  };
};

export const createMockSeries = (opts: { name: string }[]): Series => {
  return opts.map(opt => createMockSingleSeries({ name: opt.name }));
};
