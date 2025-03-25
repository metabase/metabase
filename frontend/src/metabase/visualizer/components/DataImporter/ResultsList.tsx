import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { cardApi } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, Icon, Text, Tooltip } from "metabase/ui";
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

  return (
    <Flex
      className={cx(S.resultItem, {
        [S.resultItemSelected]: selected,
        [S.resultItemIncompatible]: !isCompatible,
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
      {!isCompatible && (
        <Tooltip
          label={
            <div>
              <div>{t`This data source is not compatible with the current visualization.`}</div>
              <div>
                The current primary column is of type [
                {primaryColumn?.base_type}]
              </div>
              <div>The fields for this dataset are:</div>
              {metadata?.map((field, i) => (
                <div key={i}>
                  {field.display_name} [{field.base_type ?? "?"}]
                </div>
              ))}
            </div>
          }
        >
          <Icon
            name="warning"
            ml="auto"
            style={{
              flexShrink: 0,
            }}
          />
        </Tooltip>
      )}
    </Flex>
  );
};
