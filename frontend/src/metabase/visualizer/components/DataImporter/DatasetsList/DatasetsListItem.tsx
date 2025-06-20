import ButtonGroup from "metabase/common/components/ButtonGroup";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Button, Icon } from "metabase/ui";
import type {
  Field,
  VisualizationDisplay,
  VisualizerDataSource,
} from "metabase-types/api";

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
  const { selected, item, onToggle, onRemove } = props;

  return (
    <ButtonGroup style={{ display: "flex", gap: "8px", width: "100%" }}>
      <Button
        fullWidth
        data-testid="swap-dataset-button"
        variant="visualizer"
        aria-pressed={selected}
        size="xs"
        onClick={() => {
          selected ? onRemove?.(item) : onToggle?.(item);
        }}
        leftSection={
          <Icon color="inherit" className={S.TableIcon} name="table2" mr="xs" />
        }
      >
        <Ellipsified style={{ height: 17 }}>{item.name}</Ellipsified>
      </Button>
    </ButtonGroup>
  );
};
