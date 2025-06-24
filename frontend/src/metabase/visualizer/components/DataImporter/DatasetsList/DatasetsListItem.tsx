import { useMemo } from "react";

import ButtonGroup from "metabase/common/components/ButtonGroup";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { useSelector } from "metabase/lib/redux";
import { Button, Icon } from "metabase/ui";
import {
  getDatasets,
  getVisualizationType,
  getVisualizerComputedSettings,
  getVisualizerComputedSettingsForFlatSeries,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import type {
  Field,
  VisualizationDisplay,
  VisualizerDataSource,
} from "metabase-types/api";

import { useVisualizerUi } from "../../VisualizerUiContext";

import S from "./DatasetsListItem.module.css";
import { getIsCompatible } from "./getIsCompatible";

interface DatasetsListItemProps {
  item: VisualizerDataSource & {
    display: VisualizationDisplay | null;
    result_metadata?: Field[];
  };
  onSwap?: (item: VisualizerDataSource) => void;
  onToggle?: (item: VisualizerDataSource) => void;
  onRemove?: (item: VisualizerDataSource) => void;
  selected: boolean;
}

export const DatasetsListItem = (props: DatasetsListItemProps) => {
  const { selected, item, onSwap, onToggle, onRemove } = props;

  const { setSwapAffordanceVisible } = useVisualizerUi();

  const currentDisplay = useSelector(getVisualizationType);
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);
  const computedSettings = useSelector(
    getVisualizerComputedSettingsForFlatSeries,
  );
  const datasets = useSelector(getDatasets);

  const isCompatible = useMemo(() => {
    if (!item.display || !item.result_metadata) {
      return false;
    }

    return getIsCompatible({
      currentDataset: {
        display: currentDisplay ?? null,
        columns,
        settings,
        computedSettings,
      },
      targetDataset: {
        fields: item.result_metadata,
      },
      datasets,
    });
  }, [item, currentDisplay, columns, settings, computedSettings, datasets]);

  return (
    <ButtonGroup style={{ display: "flex", gap: "8px", width: "100%" }}>
      <Button
        fullWidth
        data-testid="swap-dataset-button"
        variant="visualizer"
        aria-pressed={selected}
        size="xs"
        onClick={() => {
          onSwap?.(item);
        }}
        onMouseOver={() => setSwapAffordanceVisible(true)}
        onMouseOut={() => setSwapAffordanceVisible(false)}
        leftSection={
          <Icon color="inherit" className={S.TableIcon} name="table2" mr="xs" />
        }
      >
        <Ellipsified style={{ height: 17 }}>{item.name}</Ellipsified>
      </Button>
      {selected ? (
        <Button
          data-testid="remove-dataset-button"
          variant="visualizer"
          aria-pressed={selected}
          size="xs"
          rightSection={<Icon name="close" />}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(item);
          }}
        />
      ) : (
        isCompatible && (
          <Button
            data-testid="add-dataset-button"
            size="xs"
            variant="visualizer"
            rightSection={<Icon name="add" />}
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.(item);
            }}
          />
        )
      )}
      {!selected && !isCompatible && (
        <Button
          data-testid="placeholder-button"
          size="xs"
          variant="visualizer"
          rightSection={<Icon name="add" />}
          style={{ opacity: 0, pointerEvents: "none" }}
        />
      )}
    </ButtonGroup>
  );
};
