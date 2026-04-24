import { useDisclosure } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import type { EntityPickerProps } from "metabase/common/components/Pickers";
import { trackDependencyEntitySelected } from "metabase/data-studio/analytics";
import { useDispatch } from "metabase/redux";
import { Button, Card, FixedSizeIcon, type IconName } from "metabase/ui";
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
  icon: IconName;
};

type GraphEntryInputProps = {
  node: DependencyNode | null;
  selectedEntry?: SelectedEntry | null;
  isGraphFetching: boolean;
  getGraphUrl: (entry: DependencyEntry | undefined) => string;
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

    if (newEntry) {
      trackDependencyEntitySelected({
        entityId: newEntry.id,
        triggeredFrom: "dependency-graph",
        eventDetail: newEntry.type,
      });
    }
  };

  const handlePickerChange = (newEntry: PickerEntry) => {
    closePicker();
    // The graph URL builder only handles DependencyEntry types. If the
    // picker returned a Database/Schema entry (not supported by this
    // graph), skip navigation — those picks are opaque to the graph view.
    if (newEntry.type === "database" || newEntry.type === "schema") {
      return;
    }
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
