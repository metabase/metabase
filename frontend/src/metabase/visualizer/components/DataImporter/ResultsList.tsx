import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cardApi } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, Icon, Text } from "metabase/ui";
import { getVisualizerPrimaryColumn } from "metabase/visualizer/selectors";
import { parseDataSourceId } from "metabase/visualizer/utils";
import { isNumber, isString } from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";
import type {
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

import S from "./ResultsList.module.css";

export interface ResultsListProps {
  items: VisualizerDataSource[];
  onSwap?: (item: VisualizerDataSource) => void;
  onAdd?: (item: VisualizerDataSource) => void;
  dataSourceIds: Set<VisualizerDataSourceId>;
  mode: "swap" | "add" | "both";
}

export const ResultsList = ({
  items,
  onSwap,
  onAdd,
  dataSourceIds,
  mode,
}: ResultsListProps) => {
  return (
    <Box component="ul">
      {items.map((item, index) => (
        <Result
          key={index}
          item={item}
          onSwap={onSwap}
          onAdd={onAdd}
          selected={dataSourceIds.has(item.id)}
          mode={mode}
        />
      ))}
    </Box>
  );
};

interface ResultProps {
  item: VisualizerDataSource;
  onSwap?: (item: VisualizerDataSource) => void;
  onAdd?: (item: VisualizerDataSource) => void;
  selected: boolean;
  mode: "swap" | "add" | "both";
}

const Result = (props: ResultProps) => {
  const { selected, item, onSwap, onAdd, mode } = props;

  const primaryColumn = useSelector(getVisualizerPrimaryColumn);

  const [metadata, setMetadata] = useState<Field[] | undefined>([]);

  const dispatch = useDispatch();

  const getFieldsMetadata = useCallback(
    async (id: VisualizerDataSourceId) => {
      const { type, sourceId } = parseDataSourceId(id);
      if (type === "card") {
        const result = await dispatch(
          cardApi.endpoints.getCard.initiate({ id: sourceId }),
        );

        setMetadata(result.data?.result_metadata);
      }
    },
    [dispatch],
  );

  useEffect(() => {
    getFieldsMetadata(item.id);
  }, [item, getFieldsMetadata]);

  const isCompatible = useMemo(() => {
    if (!primaryColumn || !metadata) {
      return true;
    }

    if (isNumber(primaryColumn) || isString(primaryColumn)) {
      return metadata?.some(field => field.id === primaryColumn.id);
    }

    return metadata.some(field => field.base_type === primaryColumn?.base_type);
  }, [metadata, primaryColumn]);

  if (mode === "add" && !isCompatible) {
    return null;
  }

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
      onClick={() => {
        if (mode === "swap") {
          onSwap?.(item);
        } else if (mode === "add") {
          onAdd?.(item);
        }
      }}
    >
      <Icon
        name="table2"
        mr="xs"
        style={{
          flexShrink: 0,
        }}
      />
      <Text size="md" truncate c="inherit" style={{ flexGrow: 1 }}>
        {item.name}
      </Text>
      {mode === "both" && (
        <>
          <Icon
            name="refresh"
            onClick={e => {
              e.stopPropagation();
              onSwap?.(item);
            }}
            ml="auto"
            style={{
              flexShrink: 0,
            }}
          />
          {/* spacer */}
          <Box
            style={{
              width: 8,
              flexShrink: 0,
            }}
          />
          <Icon
            name="add"
            onClick={e => {
              e.stopPropagation();
              onAdd?.(item);
            }}
            ml="auto"
            style={{
              flexShrink: 0,
              opacity: isCompatible ? 1 : 0.3,
            }}
          />
        </>
      )}
    </Flex>
  );
};
