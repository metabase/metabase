import { useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useDispatch, useSelector } from "metabase/redux";
import { Button, Icon, Tooltip } from "metabase/ui";
import {
  getDataSources,
  getIsDirty,
  getVisualizerInitialState,
} from "metabase/visualizer/selectors";
import { extractReferencedColumns } from "metabase/visualizer/utils/column";
import {
  initializeVisualizer,
  removeDataSource,
} from "metabase/visualizer/visualizer.slice";

import { trackVisualizerDataChanged } from "../analytics";

export function ResetButton() {
  const dispatch = useDispatch();
  const isDirty = useSelector(getIsDirty);
  const initialState = useSelector(getVisualizerInitialState);
  const currentSources = useSelector(getDataSources);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const performReset = () => {
    trackVisualizerDataChanged("visualizer_datasource_reset");

    // initializeFromState only fetches the sources referenced in the initial
    // viz definition without touching state.cards, so any sources the user
    // added after opening would survive. Remove them explicitly first.
    const initialSourceIds = new Set(
      initialState.columnValuesMapping
        ? extractReferencedColumns(initialState.columnValuesMapping).map(
            (ref) => ref.sourceId,
          )
        : [],
    );
    currentSources.forEach((source) => {
      if (!initialSourceIds.has(source.id)) {
        dispatch(removeDataSource({ source }));
      }
    });

    dispatch(initializeVisualizer({ state: initialState }));
  };

  return (
    <>
      <Tooltip withinPortal={false} label={t`Reset to defaults`}>
        <Button
          size="sm"
          aria-label={t`Reset to defaults`}
          disabled={!isDirty}
          onClick={() => setIsConfirmOpen(true)}
          data-testid="visualizer-reset-button"
          leftSection={
            <Icon name="revert" c={isDirty ? "unset" : "text-tertiary"} />
          }
        />
      </Tooltip>
      <ConfirmModal
        opened={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title={t`Reset to defaults?`}
        content={t`This will discard your changes and restore the visualization to the state you started with.`}
        message={t`Are you sure you want to reset?`}
        confirmButtonText={t`Reset`}
        onConfirm={() => {
          performReset();
          setIsConfirmOpen(false);
        }}
      />
    </>
  );
}
