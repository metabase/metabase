import ButtonGroup from "metabase/common/components/ButtonGroup";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Button, Icon } from "metabase/ui";
import type {
  Field,
  VisualizationDisplay,
  VisualizerDataSource,
} from "metabase-types/api";

import { useVisualizerUi } from "../../VisualizerUiContext";

import S from "./DatasetsListItem.module.css";

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

  // TODO: We run compatibility in DatasetsList now
  const isCompatible = true;

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
