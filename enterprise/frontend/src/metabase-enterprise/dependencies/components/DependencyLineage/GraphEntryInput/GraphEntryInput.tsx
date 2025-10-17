import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { EntryButton } from "./EntryButton";
import { EntrySearchInput } from "./EntrySearchInput";
import { DEFAULT_SEARCH_MODELS } from "./constants";

type GraphEntryInputProps = {
  node: DependencyNode | undefined;
  isGraphFetching: boolean;
  onEntryChange: (entry: DependencyEntry | undefined) => void;
};

export function GraphEntryInput({
  node,
  isGraphFetching,
  onEntryChange,
}: GraphEntryInputProps) {
  const [searchModels, setSearchModels] = useState(DEFAULT_SEARCH_MODELS);
  const [_isPickerOpened, { open: openPicker }] = useDisclosure();

  return node != null ? (
    <EntryButton node={node} onEntryChange={onEntryChange} />
  ) : (
    <EntrySearchInput
      searchModels={searchModels}
      isGraphFetching={isGraphFetching}
      onEntryChange={onEntryChange}
      onSearchModelsChange={setSearchModels}
      onPickerOpen={openPicker}
    />
  );
}
