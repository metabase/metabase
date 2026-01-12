import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Box, Button, Icon, Tooltip } from "metabase/ui";
import type {
  Field,
  VisualizationDisplay,
  VisualizerDataSource,
} from "metabase-types/api";

import S from "./DatasetsListItem.module.css";

export type Item = VisualizerDataSource & {
  notRecommended?: boolean;
  display: VisualizationDisplay | null;
  result_metadata?: Field[];
};

interface DatasetsListItemProps {
  item: Item;
  onSwap?: (item: VisualizerDataSource) => void;
  onToggle?: (item: VisualizerDataSource) => void;
  onRemove?: (item: VisualizerDataSource) => void;
  selected: boolean;
}

export const DatasetsListItem = (props: DatasetsListItemProps) => {
  const { selected, item, onToggle, onRemove } = props;

  return (
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
        <Box>
          <Icon c="inherit" className={S.TableIcon} name="table2" mr="xs" />
          {item.notRecommended && (
            <Tooltip
              label={t`This dataset might not be fully compatible with your current selection.`}
            >
              <Icon
                className={S.WarningIcon}
                c="danger"
                name="warning_round_filled"
                size={10}
              />
            </Tooltip>
          )}
        </Box>
      }
      style={{ flex: 0, minHeight: 30, paddingLeft: 8, paddingRight: 8 }}
    >
      <Ellipsified style={{ height: 17 }}>{item.name}</Ellipsified>
    </Button>
  );
};
