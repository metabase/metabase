import { useMemo } from "react";

import { useGetCardQuery } from "metabase/api";
import ButtonGroup from "metabase/core/components/ButtonGroup";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { useSelector } from "metabase/lib/redux";
import { Button, Icon } from "metabase/ui";
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
  onMouseOver?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseOut?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onAddMouseOver?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onAddMouseOut?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const DatasetsListItem = (props: DatasetsListItemProps) => {
  const {
    selected,
    item,
    onSwap,
    onAdd,
    onRemove,
    onAddMouseOut,
    onAddMouseOver,
    onMouseOut,
    onMouseOver,
  } = props;

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
    <ButtonGroup style={{ display: "flex", gap: "8px", width: "100%" }}>
      <Button
        fullWidth
        variant="visualizer"
        aria-pressed={selected}
        size="xs"
        onClick={() => {
          onSwap?.(item);
        }}
        onMouseOver={onMouseOver}
        onMouseOut={onMouseOut}
        leftSection={
          <Icon color="inherit" className={S.TableIcon} name="table2" mr="xs" />
        }
      >
        <Ellipsified>{item.name}</Ellipsified>
      </Button>
      {selected ? (
        <Button
          data-testid="remove-dataset-button"
          variant="visualizer"
          aria-pressed={selected}
          size="xs"
          rightSection={<Icon name="close" />}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(item);
          }}
        />
      ) : (
        isCompatible && (
          <Button
            data-testid="add-dataset-button"
            size="xs"
            variant="visualizer"
            rightSection={<Icon name="add" />}
            onMouseOver={onAddMouseOver}
            onMouseOut={onAddMouseOut}
            onClick={(e) => {
              e.stopPropagation();
              onAdd?.(item);
            }}
          />
        )
      )}
      {!selected && !isCompatible && (
        <Button
          data-testid="placeholder-button"
          size="xs"
          variant="visualizer"
          rightSection={<Icon name="add" />}
          style={{ opacity: 0, pointerEvents: "none" }}
        />
      )}
    </ButtonGroup>
  );
};
