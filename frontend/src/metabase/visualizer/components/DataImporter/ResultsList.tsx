import cx from "classnames";

import { Box, Flex, Icon, Text } from "metabase/ui";
import type {
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

import S from "./ResultsList.module.css";

export interface ResultsListProps {
  items: VisualizerDataSource[];
  onSelect?: (item: VisualizerDataSource) => void;
  dataSourceIds: Set<VisualizerDataSourceId>;
}

export const ResultsList = ({
  items,
  onSelect,
  dataSourceIds,
}: ResultsListProps) => {
  return (
    <Box component="ul">
      {items.map((item, index) => (
        <Result
          key={index}
          item={item}
          onSelect={onSelect}
          selected={dataSourceIds.has(item.id)}
        />
      ))}
    </Box>
  );
};

interface ResultProps {
  item: VisualizerDataSource;
  onSelect?: (item: VisualizerDataSource) => void;
  selected: boolean;
}

const Result = (props: ResultProps) => {
  const { selected, item, onSelect } = props;

  return (
    <Flex
      className={cx(S.resultItem, {
        [S.resultItemSelected]: selected,
      })}
      align="center"
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
  );
};
