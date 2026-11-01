import { t } from "ttag";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Box, Button, Ellipsified, Icon, Tooltip } from "metabase/ui";
import type {
  Field,
  SearchModel,
  VisualizationDisplay,
  VisualizerDataSource,
} from "metabase-types/api";

import S from "./DatasetsListItem.module.css";

export type Item = VisualizerDataSource & {
  model: SearchModel;
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
  const getIcon = useGetIcon();

  return (
    <Button
      justify="start"
      flex="0 0 auto"
      pl={0}
      variant={selected ? "filled" : "subtle"}
      color={selected ? "brand" : "neutral"}
      data-testid="swap-dataset-button"
      aria-pressed={selected}
      onClick={() => {
        if (selected) {
          onRemove?.(item);
        } else {
          onToggle?.(item);
        }
      }}
      leftSection={
        <Box mr="xxs">
          <EntityIcon
            {...getIcon({ model: item.model, display: item.display })}
            c="inherit"
          />
          {item.notRecommended && (
            <Tooltip
              label={t`This dataset might not be fully compatible with your current selection.`}
            >
              <Icon
                className={S.WarningIcon}
                c="feedback-negative"
                name="warning_round_filled"
                size={10}
              />
            </Tooltip>
          )}
        </Box>
      }
    >
      <Ellipsified>{item.name}</Ellipsified>
    </Button>
  );
};
