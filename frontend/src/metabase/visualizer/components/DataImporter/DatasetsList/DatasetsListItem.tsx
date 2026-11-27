import { t } from "ttag";

import { PLUGIN_MODERATION } from "metabase/plugins";
import { Box, Button, Ellipsified, Flex, Icon, Tooltip } from "metabase/ui";
import type {
  Field,
  ModerationReviewStatus,
  VisualizationDisplay,
  VisualizerDataSource,
} from "metabase-types/api";

import S from "./DatasetsListItem.module.css";

export type Item = VisualizerDataSource & {
  notRecommended?: boolean;
  display: VisualizationDisplay | null;
  result_metadata?: Field[];
  moderated_status?: ModerationReviewStatus;
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
        <Box>
          <Icon c="inherit" name="table2" mr="xxs" />
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
      <Flex align="center" miw={0}>
        <Ellipsified>{item.name}</Ellipsified>
        <PLUGIN_MODERATION.ModerationStatusIcon
          status={item.moderated_status}
          filled
          size={14}
          ml="xs"
        />
      </Flex>
    </Button>
  );
};
