import cx from "classnames";

import { Box, Flex, Icon, Text } from "metabase/ui";
import type {
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

export interface ResultsListProps {
  items: VisualizerDataSource[];
  onSelect?: (item: VisualizerDataSource) => void;
  dataSourceIds: Set<VisualizerDataSourceId>;
}

import S from "./ResultsList.module.css";

export const ResultsList = ({
  items,
  onSelect,
  dataSourceIds,
}: ResultsListProps) => {
  return (
    <Box component="ul">
      {items.map((item, index) => (
        <Flex
          className={cx(S.resultItem, {
            [S.resultItemSelected]: dataSourceIds.has(item.id),
          })}
          align="center"
          key={index}
          component="li"
          px="sm"
          py="sm"
          mb="xs"
          onClick={() => onSelect?.(item)}
        >
          <Icon
            name="table2"
            mr="xs"
            style={{
              flexShrink: 0,
            }}
          />
          <Text size="md" truncate c="inherit">
            {item.name}
          </Text>
        </Flex>
      ))}
    </Box>
  );
};
