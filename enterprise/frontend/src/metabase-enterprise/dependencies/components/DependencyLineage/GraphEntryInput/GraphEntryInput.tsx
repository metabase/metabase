import { useState } from "react";

import type {
  DependencyEntry,
  DependencyNode,
  SearchModel,
} from "metabase-types/api";

import { EntryButton } from "./EntryButton";
import { EntrySearchInput } from "./EntrySearchInput";

type GraphEntryInputProps = {
  node: DependencyNode | undefined;
  isGraphFetching: boolean;
  onEntryChange: (entry: DependencyEntry | undefined) => void;
};

const DEFAULT_SEARCH_MODELS: SearchModel[] = [
  "card",
  "dataset",
  "metric",
  "table",
  "transform",
];

export function GraphEntryInput({
  node,
  isGraphFetching,
  onEntryChange,
}: GraphEntryInputProps) {
  const [searchModels, setSearchModels] = useState(DEFAULT_SEARCH_MODELS);

  return node != null ? (
    <EntryButton node={node} onEntryChange={onEntryChange} />
  ) : (
    <EntrySearchInput
      searchModels={searchModels}
      isGraphFetching={isGraphFetching}
      onEntryChange={onEntryChange}
      onSearchModelsChange={setSearchModels}
    />
  );
}
