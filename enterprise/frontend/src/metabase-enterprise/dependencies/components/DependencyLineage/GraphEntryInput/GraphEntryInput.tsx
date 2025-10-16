import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { SearchInput } from "./SearchInput";

type GraphEntryInputProps = {
  node: DependencyNode | undefined;
  isFetching: boolean;
  onEntryChange: (entry: DependencyEntry) => void;
};

export function GraphEntryInput({ onEntryChange }: GraphEntryInputProps) {
  return <SearchInput onEntryChange={onEntryChange} />;
}
