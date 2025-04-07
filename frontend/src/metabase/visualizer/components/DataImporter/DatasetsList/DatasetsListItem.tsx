import cx from "classnames";
import { useMemo } from "react";

import { useGetCardQuery } from "metabase/api";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { useSelector } from "metabase/lib/redux";
import { Button, Flex, Icon } from "metabase/ui";
import {
  getVisualizationType,
  getVisualizerPrimaryColumn,
} from "metabase/visualizer/selectors";
import { parseDataSourceId } from "metabase/visualizer/utils";
import type { VisualizerDataSource } from "metabase-types/store/visualizer";

import S from "./DatasetsListItem.module.css";
import { getIsCompatible } from "./getIsCompatible";

interface DatasetsListItemProps {
  item: VisualizerDataSource;
  onSwap?: (item: VisualizerDataSource) => void;
  onAdd?: (item: VisualizerDataSource) => void;
  onRemove?: (item: VisualizerDataSource) => void;
  selected: boolean;
}

export const DatasetsListItem = (props: DatasetsListItemProps) => {
  const { selected, item, onSwap, onAdd, onRemove } = props;

  const currentDisplay = useSelector(getVisualizationType);
  const primaryColumn = useSelector(getVisualizerPrimaryColumn);

  const { sourceId } = parseDataSourceId(item.id);
  const { data } = useGetCardQuery({ id: sourceId });

  const metadata = useMemo(
    () => ({
      display: data?.display,
      fields: data?.result_metadata,
    }),
    [data],
  );

  const isCompatible = useMemo(() => {
    const { display, fields } = metadata;

    return getIsCompatible({
      currentDataset: {
        display: currentDisplay,
        primaryColumn,
      },
      targetDataset: {
        display,
        fields,
      },
    });
  }, [metadata, primaryColumn, currentDisplay]);

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
      {selected ? (
        <Button
          data-testid="remove-dataset-button"
          className={S.RemoveButton}
          variant="filled"
          size="xs"
          rightSection={<Icon name="trash" />}
          onClick={e => {
            e.stopPropagation();
            onRemove?.(item);
          }}
          style={{
            flexShrink: 0,
          }}
        />
      ) : (
        isCompatible && (
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
        )
      )}
    </Flex>
  );
};
