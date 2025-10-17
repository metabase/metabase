import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import { Card } from "metabase/ui";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { EntryButton } from "./EntryButton";
import { EntryPickerModal } from "./EntryPickerModal";
import { EntrySearchInput } from "./EntrySearchInput";
import { SEARCH_MODELS } from "./constants";

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
  const [searchModels, setSearchModels] = useState(SEARCH_MODELS);
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure();

  const handlePickerChange = (newEntry: DependencyEntry) => {
    closePicker();
    onEntryChange(newEntry);
  };

  return (
    <>
      <Card p={0} bdrs={0}>
        {node != null ? (
          <EntryButton
            node={node}
            onEntryChange={onEntryChange}
            onPickerOpen={openPicker}
          />
        ) : (
          <EntrySearchInput
            searchModels={searchModels}
            isGraphFetching={isGraphFetching}
            onEntryChange={onEntryChange}
            onSearchModelsChange={setSearchModels}
            onPickerOpen={openPicker}
          />
        )}
      </Card>
      {isPickerOpened && (
        <EntryPickerModal
          value={node}
          onChange={handlePickerChange}
          onClose={closePicker}
        />
      )}
    </>
  );
}
