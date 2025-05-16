import { useMemo } from "react";

import ButtonGroup from "metabase/core/components/ButtonGroup";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { useSelector } from "metabase/lib/redux";
import { Button, Icon } from "metabase/ui";
import {
  getVisualizationType,
  getVisualizerPrimaryColumn,
} from "metabase/visualizer/selectors";
import type {
  Field,
  VisualizationDisplay,
  VisualizerCardDataSource,
} from "metabase-types/api";

import { useVisualizerUi } from "../../VisualizerUiContext";

import S from "./DatasetsListItem.module.css";
import { getIsCompatible } from "./getIsCompatible";

interface DatasetsListItemProps {
  item: VisualizerCardDataSource & {
    display: VisualizationDisplay | null;
    result_metadata?: Field[];
  };
  onSwap?: (item: VisualizerCardDataSource) => void;
  onToggle?: (item: VisualizerCardDataSource) => void;
  onRemove?: (item: VisualizerCardDataSource) => void;
  selected: boolean;
}

export const DatasetsListItem = (props: DatasetsListItemProps) => {
  const { selected, item, onSwap, onToggle, onRemove } = props;

  const { setSwapAffordanceVisible } = useVisualizerUi();

  const currentDisplay = useSelector(getVisualizationType);
  const primaryColumn = useSelector(getVisualizerPrimaryColumn);

  const isCompatible = useMemo(() => {
    if (!item.display || !item.result_metadata) {
      return false;
    }

    return getIsCompatible({
      currentDataset: {
        display: currentDisplay,
        primaryColumn,
      },
      targetDataset: {
        display: item.display,
        fields: item.result_metadata,
      },
    });
  }, [item, primaryColumn, currentDisplay]);

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
