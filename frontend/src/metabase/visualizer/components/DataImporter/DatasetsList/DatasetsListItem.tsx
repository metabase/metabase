import { useMemo } from "react";

import { useGetCardQuery } from "metabase/api";
import ButtonGroup from "metabase/core/components/ButtonGroup";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { useSelector } from "metabase/lib/redux";
import { Button, Icon } from "metabase/ui";
import {
  getVisualizationType,
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import type { VisualizerCardDataSource } from "metabase-types/api";

import { useVisualizerUi } from "../../VisualizerUiContext";

import S from "./DatasetsListItem.module.css";
import { getIsCompatible } from "./getIsCompatible";

interface DatasetsListItemProps {
  item: VisualizerCardDataSource;
  onSwap?: (item: VisualizerCardDataSource) => void;
  onToggle?: (item: VisualizerCardDataSource) => void;
  onRemove?: (item: VisualizerCardDataSource) => void;
  selected: boolean;
}

export const DatasetsListItem = (props: DatasetsListItemProps) => {
  const { selected, item, onSwap, onToggle, onRemove } = props;

  const { setSwapAffordanceVisible } = useVisualizerUi();

  const currentDisplay = useSelector(getVisualizationType);
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);

  const { data } = useGetCardQuery({ id: item.cardId });

  const metadata = useMemo(
    () => ({
      display: data?.display,
      fields: data?.result_metadata,
    }),
    [data],
  );

  const isCompatible = useMemo(() => {
    const { display, fields } = metadata;

    return getIsCompatible({
      currentDataset: {
        display: currentDisplay ?? null,
        columns,
        settings,
      },
      targetDataset: {
        display,
        fields,
      },
    });
  }, [columns, currentDisplay, metadata, settings]);

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
