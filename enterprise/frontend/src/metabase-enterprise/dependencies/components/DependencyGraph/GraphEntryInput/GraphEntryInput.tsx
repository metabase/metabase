import { useDisclosure } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import type { EntityPickerProps } from "metabase/common/components/Pickers";
import { useDispatch } from "metabase/lib/redux";
import { Button, Card, FixedSizeIcon } from "metabase/ui";
import type {
  DependencyEntry,
  DependencyNode,
  SearchModel,
} from "metabase-types/api";

import { EntryButton } from "./EntryButton";
import { EntryPickerModal, type PickerEntry } from "./EntryPickerModal";
import { EntrySearchInput } from "./EntrySearchInput";
import { SEARCH_MODELS } from "./constants";

export type SelectedEntry = {
  label: string;
  icon: string;
};

type GraphEntryInputProps = {
  node: DependencyNode | null;
  selectedEntry?: SelectedEntry | null;
  isGraphFetching: boolean;
  getGraphUrl: (entry: PickerEntry | undefined) => string;
  allowedSearchModels?: SearchModel[];
  pickerModels?: EntityPickerProps["models"];
};

export function GraphEntryInput({
  node,
  selectedEntry,
  isGraphFetching,
  getGraphUrl,
  allowedSearchModels = SEARCH_MODELS,
  pickerModels,
}: GraphEntryInputProps) {
  const showModelPicker = allowedSearchModels === SEARCH_MODELS;
  const [searchModels, setSearchModels] =
    useState<SearchModel[]>(allowedSearchModels);
  const dispatch = useDispatch();
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure();

  const handleEntryChange = (newEntry: DependencyEntry | undefined) => {
    dispatch(push(getGraphUrl(newEntry)));
  };

  const handlePickerChange = (newEntry: PickerEntry) => {
    closePicker();
    dispatch(push(getGraphUrl(newEntry)));
  };

  const handleClear = (event: MouseEvent) => {
    event.stopPropagation();
    dispatch(push(getGraphUrl(undefined)));
  };

  const hasSelection = node != null || selectedEntry != null;

  return (
    <>
      <Card p={0} flex="0 1 auto" bdrs={0} bg="transparent">
        {node != null ? (
          <EntryButton
            node={node}
            onEntryChange={handleEntryChange}
            onPickerOpen={openPicker}
          />
        ) : selectedEntry != null ? (
          <Button
            leftSection={<FixedSizeIcon name={selectedEntry.icon} />}
            rightSection={
              <FixedSizeIcon
                name="close"
                display="block"
                aria-label={t`Clear`}
                onClick={handleClear}
              />
            }
            data-testid="graph-entry-button"
            onClick={openPicker}
          >
            {selectedEntry.label}
          </Button>
        ) : (
          <EntrySearchInput
            searchModels={searchModels}
            isGraphFetching={isGraphFetching}
            showModelPicker={showModelPicker}
            onEntryChange={handleEntryChange}
            onSearchModelsChange={setSearchModels}
            onPickerOpen={openPicker}
          />
        )}
      </Card>
      {isPickerOpened && (
        <EntryPickerModal
          value={hasSelection ? node : null}
          models={pickerModels}
          onChange={handlePickerChange}
          onClose={closePicker}
        />
      )}
    </>
  );
}
