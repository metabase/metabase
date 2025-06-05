import { useDraggable } from "@dnd-kit/core";
import { t } from "ttag";

import { trackSimpleEvent } from "metabase/lib/analytics";
import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, Icon, Loader, Text } from "metabase/ui";
import { DRAGGABLE_ID } from "metabase/visualizer/constants";
import {
  getDataSources,
  getDatasets,
  getLoadingDatasets,
  getReferencedColumns,
  getVisualizationType,
  getVisualizerComputedSettings,
  getVisualizerComputedSettingsForFlatSeries,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { isReferenceToColumn } from "metabase/visualizer/utils";
import { findSlotForColumn } from "metabase/visualizer/visualizations/compat";
import { addColumn, removeColumn } from "metabase/visualizer/visualizer.slice";
import type {
  DatasetColumn,
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/api";

import S from "./ColumnsList.module.css";
import { ColumnsListItem, type ColumnsListItemProps } from "./ColumnsListItem";

export interface ColumnListProps {
  collapsedDataSources: Record<string, boolean>;
  toggleDataSource: (sourceId: VisualizerDataSourceId) => void;
  onRemoveDataSource: (source: VisualizerDataSource) => void;
}

export const ColumnsList = (props: ColumnListProps) => {
  const { collapsedDataSources, toggleDataSource, onRemoveDataSource } = props;

  const display = useSelector(getVisualizationType) ?? null;
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);
  const flatSettings = useSelector(getVisualizerComputedSettingsForFlatSeries);
  const dataSources = useSelector(getDataSources);
  const datasets = useSelector(getDatasets);
  const loadingDatasets = useSelector(getLoadingDatasets);
  const referencedColumns = useSelector(getReferencedColumns);
  const dispatch = useDispatch();

  const handleAddColumn = (
    dataSource: VisualizerDataSource,
    column: DatasetColumn,
  ) => {
    dispatch(addColumn({ dataSource, column }));
  };

  const handleRemoveColumn = (columnRefName: string) => {
    dispatch(removeColumn({ name: columnRefName, well: "all" }));
  };

  return (
    <Flex
      px={12}
      direction="column"
      style={{
        overflowY: "auto",
      }}
    >
      {dataSources.map((source) => {
        const dataset = datasets[source.id];
        const isLoading = loadingDatasets[source.id];
        const isCollapsed = collapsedDataSources[source.id];

        return (
          <Box key={source.id} mb={4} data-testid="data-source-list-item">
            <Flex align="center" px={8} py={4} className={S.parent}>
              {!isLoading ? (
                <Icon
                  style={{ flexShrink: 0 }}
                  name={isCollapsed ? "chevrondown" : "chevronup"}
                  aria-label={t`Expand`}
                  size={12}
                  mr={6}
                  cursor="pointer"
                  onClick={() => toggleDataSource(source.id)}
                />
              ) : (
                <Loader size={12} mr={6} />
              )}
              <Text truncate mr={4}>
                {source.name}
              </Text>
              {!isLoading && (
                <Icon
                  style={{ flexShrink: 0 }}
                  className={S.close}
                  name="close"
                  ml="auto"
                  size={12}
                  aria-label={t`Remove`}
                  cursor="pointer"
                  onClick={() => {
                    trackSimpleEvent({
                      event: "visualizer_data_changed",
                      event_detail: "visualizer_datasource_removed",
                      triggered_from: "visualizer-modal",
                      event_data: source.id,
                    });
                    onRemoveDataSource(source);
                  }}
                />
              )}
            </Flex>
            {!isCollapsed && dataset && dataset.data.cols && (
              <Box ml={12} mt={2}>
                {dataset.data.cols.map((column) => {
                  if (isPivotGroupColumn(column)) {
                    return null;
                  }

                  const columnReference = referencedColumns.find((ref) =>
                    isReferenceToColumn(column, source.id, ref),
                  );
                  const isSelected = !!columnReference;

                  const isUsable = !!findSlotForColumn(
                    { display, columns, settings },
                    flatSettings,
                    datasets,
                    dataset.data.cols,
                    column,
                  );

                  return (
                    <DraggableColumnListItem
                      key={column.name}
                      column={column}
                      dataSource={source}
                      isDisabled={!isSelected && !isUsable}
                      isSelected={isSelected}
                      onClick={() => {
                        if (!isSelected) {
                          trackSimpleEvent({
                            event: "visualizer_data_changed",
                            event_detail: "visualizer_column_added",
                            triggered_from: "visualizer-modal",
                            event_data: `source: ${source.id}, column: ${column.name}`,
                          });

                          handleAddColumn(source, column);
                        }
                      }}
                      onRemove={
                        isSelected
                          ? () => {
                              trackSimpleEvent({
                                event: "visualizer_data_changed",
                                event_detail: "visualizer_column_removed",
                                triggered_from: "visualizer-modal",
                                event_data: `source: ${source.id}, column: ${column.name}`,
                              });

                              handleRemoveColumn(columnReference.name);
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </Box>
            )}
          </Box>
        );
      })}
    </Flex>
  );
};

type DraggableColumnListItemProps = ColumnsListItemProps & {
  isSelected: boolean;
  dataSource: VisualizerDataSource;
};

function DraggableColumnListItem({
  column,
  dataSource,
  isSelected,
  ...props
}: DraggableColumnListItemProps) {
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: `${DRAGGABLE_ID.COLUMN}:${dataSource.id}:${column.name}`,
    data: {
      type: DRAGGABLE_ID.COLUMN,
      column,
      dataSource,
    },
  });

  return (
    <ColumnsListItem
      {...props}
      {...attributes}
      {...listeners}
      bg={isSelected ? "var(--mb-color-brand-lighter)" : undefined}
      column={column}
      style={{ visibility: isDragging ? "hidden" : "visible" }}
      aria-selected={isSelected}
      data-testid="column-list-item"
      ref={setNodeRef}
    />
  );
}
