import type { Token } from "./model/types";
import type {
  FilterBarAdapter,
  FilterBarStageAdapter,
  FilterTree,
  PillContent,
} from "./types";

export const createTestPill = (name: string): PillContent => ({
  type: "opaque",
  displayName: name,
  icon: "filter",
});

const TEST_STAGE_ADAPTER: FilterBarStageAdapter<string> = {
  columnGroups: () => [],
  operators: () => [],
  toFilter: () => null,
  toPill: createTestPill,
  formatValues: () => "",
};

export const TEST_ADAPTER: FilterBarAdapter<string> = {
  supportsOr: true,
  stage: () => TEST_STAGE_ADAPTER,
};

export const pill = (filter: string): Token<string> => ({
  type: "pill",
  filter,
  content: createTestPill(filter),
});

export const AND: Token<string> = { type: "and" };
export const OR: Token<string> = { type: "or" };
export const OPEN: Token<string> = { type: "open" };
export const CLOSE: Token<string> = { type: "close" };
export const THEN: Token<string> = { type: "then" };

export const leaf = (filter: string): FilterTree<string> => ({
  type: "leaf",
  filter,
});

export const and = (...children: FilterTree<string>[]): FilterTree<string> => ({
  type: "and",
  children,
});

export const or = (...children: FilterTree<string>[]): FilterTree<string> => ({
  type: "or",
  children,
});
