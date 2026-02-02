import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import { Card } from "metabase/ui";
import type {
  DependencyEntry,
  DependencyNode,
  SearchModel,
} from "metabase-types/api";

import { EntryButton } from "./EntryButton";
import { EntryPickerModal } from "./EntryPickerModal";
import { EntrySearchInput } from "./EntrySearchInput";
import { SEARCH_MODELS } from "./constants";

type GraphEntryInputProps = {
  node: DependencyNode | null;
  isGraphFetching: boolean;
  getGraphUrl: (entry: DependencyEntry | undefined) => string;
};

export function GraphEntryInput({
  node,
  isGraphFetching,
  getGraphUrl,
}: GraphEntryInputProps) {
  const [searchModels, setSearchModels] =
    useState<SearchModel[]>(SEARCH_MODELS);
  const dispatch = useDispatch();
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure();

  const handleEntryChange = (newEntry: DependencyEntry | undefined) => {
    dispatch(push(getGraphUrl(newEntry)));
  };

  const handlePickerChange = (newEntry: DependencyEntry) => {
    closePicker();
    handleEntryChange(newEntry);
  };

  return (
    <>
      <Card p={0} flex="0 1 auto" bdrs={0} bg="transparent">
        {node != null ? (
          <EntryButton
            node={node}
            onEntryChange={handleEntryChange}
            onPickerOpen={openPicker}
          />
        ) : (
          <EntrySearchInput
            searchModels={searchModels}
            isGraphFetching={isGraphFetching}
            onEntryChange={handleEntryChange}
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
