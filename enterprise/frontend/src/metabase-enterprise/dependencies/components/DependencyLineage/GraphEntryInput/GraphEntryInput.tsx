import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { EntryButton } from "./EntryButton";
import { SearchInput } from "./SearchInput";

type GraphEntryInputProps = {
  node: DependencyNode | undefined;
  isFetching: boolean;
  onEntryChange: (entry: DependencyEntry | undefined) => void;
};

export function GraphEntryInput({
  node,
  isFetching,
  onEntryChange,
}: GraphEntryInputProps) {
  return node != null ? (
    <EntryButton node={node} onEntryChange={onEntryChange} />
  ) : (
    <SearchInput isFetching={isFetching} onEntryChange={onEntryChange} />
  );
}
