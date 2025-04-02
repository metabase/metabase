import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cardApi } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Button, Flex, Icon, Text } from "metabase/ui";
import { getVisualizerPrimaryColumn } from "metabase/visualizer/selectors";
import { parseDataSourceId } from "metabase/visualizer/utils";
import { isNumber, isString } from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";
import type {
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

import S from "./Result.module.css";

interface ResultProps {
  item: VisualizerDataSource;
  onSwap?: (item: VisualizerDataSource) => void;
  onAdd?: (item: VisualizerDataSource) => void;
  selected: boolean;
  mode: "swap" | "add" | "both";
}

export const Result = (props: ResultProps) => {
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
        onSwap?.(item);
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
        <div className={S.resultItemActions}>
          <Icon name="refresh" className={S.refreshIcon} />

          <Button
            variant={selected ? "filled" : "inverse"}
            size="xs"
            rightSection={<Icon name="add" />}
            onClick={e => {
              e.stopPropagation();
              onAdd?.(item);
            }}
            style={{
              opacity: selected ? 0 : isCompatible ? 1 : 0.5,
              pointerEvents: isCompatible ? "auto" : "none",
            }}
          />
        </div>
      )}
    </Flex>
  );
};
