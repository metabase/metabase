import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cardApi } from "metabase/api";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Button, Flex, Icon } from "metabase/ui";
import {
  getVisualizationType,
  getVisualizerPrimaryColumn,
} from "metabase/visualizer/selectors";
import { parseDataSourceId } from "metabase/visualizer/utils";
import { isNumber, isString } from "metabase-lib/v1/types/utils/isa";
import type { Field, VisualizationDisplay } from "metabase-types/api";
import type {
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

import S from "./DatasetsListItem.module.css";

interface DatasetsListItemProps {
  item: VisualizerDataSource;
  onSwap?: (item: VisualizerDataSource) => void;
  onAdd?: (item: VisualizerDataSource) => void;
  selected: boolean;
  mode: "swap" | "add" | "both";
}

export const DatasetsListItem = (props: DatasetsListItemProps) => {
  const { selected, item, onSwap, onAdd, mode } = props;

  const currentDisplay = useSelector(getVisualizationType);
  const primaryColumn = useSelector(getVisualizerPrimaryColumn);

  const [metadata, setMetadata] = useState<{
    display?: VisualizationDisplay | undefined;
    fields?: Field[] | undefined;
  }>({});

  const dispatch = useDispatch();

  const getFieldsMetadata = useCallback(
    async (id: VisualizerDataSourceId) => {
      const { type, sourceId } = parseDataSourceId(id);
      if (type === "card") {
        const result = await dispatch(
          cardApi.endpoints.getCard.initiate({ id: sourceId }),
        );

        setMetadata({
          display: result.data?.display,
          fields: result.data?.result_metadata,
        });
      }
    },
    [dispatch],
  );

  useEffect(() => {
    getFieldsMetadata(item.id);
  }, [item, getFieldsMetadata]);

  const isCompatible = useMemo(() => {
    const { display, fields } = metadata;

    if (currentDisplay === "pie") {
      return false;
    }

    if (currentDisplay === "scalar") {
      return display === "scalar";
    }

    if (!primaryColumn || !metadata) {
      return true;
    }

    if (isNumber(primaryColumn) || isString(primaryColumn)) {
      return fields?.some(field => field.id === primaryColumn.id);
    }

    return fields?.some(field => field.base_type === primaryColumn?.base_type);
  }, [metadata, primaryColumn, currentDisplay]);

  if (mode === "add" && !isCompatible) {
    return null;
  }

  return (
    <Flex
      className={cx(S.DatasetsListItem, {
        [S.DatasetsListItemSelected]: selected,
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
        className={S.TableIcon}
        name="table2"
        mr="xs"
        style={{
          flexShrink: 0,
        }}
      />
      <Icon
        className={S.InfoIcon}
        name="info_filled"
        mr="xs"
        style={{
          flexShrink: 0,
        }}
      />
      <Ellipsified style={{ flexGrow: 1, paddingBottom: 1 }}>
        {item.name}
      </Ellipsified>
      {mode === "both" && !selected && isCompatible && (
        <Button
          data-testid="add-dataset-button"
          className={S.AddButton}
          variant="inverse"
          size="xs"
          rightSection={<Icon name="add" />}
          onClick={e => {
            e.stopPropagation();
            onAdd?.(item);
          }}
          style={{
            flexShrink: 0,
          }}
        />
      )}
    </Flex>
  );
};
