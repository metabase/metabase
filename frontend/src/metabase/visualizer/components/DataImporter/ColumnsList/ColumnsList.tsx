import { useDraggable } from "@dnd-kit/core";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { trackSimpleEvent } from "metabase/lib/analytics";
import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, Icon, Loader, Menu, Text } from "metabase/ui";
import { DRAGGABLE_ID } from "metabase/visualizer/constants";
import { useIsCardPristine } from "metabase/visualizer/hooks/use-is-card-pristine";
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
import {
  addColumn,
  removeColumn,
  setHoveredItems,
} from "metabase/visualizer/visualizer.slice";
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
  onResetDataSource: (source: VisualizerDataSource) => void;
}

export const ColumnsList = (props: ColumnListProps) => {
  const {
    collapsedDataSources,
    toggleDataSource,
    onRemoveDataSource,
    onResetDataSource,
  } = props;

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

  const isPristine = useIsCardPristine({
    source: dataSources[0],
  });
  const isSingleDataSource = dataSources.length === 1;

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
              <Text truncate mr={4} flex={1}>
                {source.name}
              </Text>
              {!isLoading && isSingleDataSource && (
                <Menu position="bottom-end">
                  <Menu.Target>
                    <ToolbarButton
                      className={S.ActionsButton}
                      icon="ellipsis"
                      data-testid="datasource-actions-button"
                      aria-label={t`Datasource actions`}
                    />
                  </Menu.Target>
                  <Menu.Dropdown data-testid="datasource-actions-dropdown">
                    <Menu.Item
                      key="reset_data_source"
                      leftSection={<Icon name="revert" />}
                      disabled={isPristine}
                      onClick={() => {
                        trackSimpleEvent({
                          event: "visualizer_data_changed",
                          event_detail: "visualizer_datasource_reset",
                          triggered_from: "visualizer-modal",
                        });
                        onResetDataSource(source);
                      }}
                      aria-label={t`Reset data source`}
                      data-testid="reset-datasource-button"
                    >
                      {t`Reset to defaults`}
                    </Menu.Item>
                    <Menu.Item
                      key="remove_data_source"
                      leftSection={<Icon name="close" />}
                      onClick={() => {
                        trackSimpleEvent({
                          event: "visualizer_data_changed",
                          event_detail: "visualizer_datasource_removed",
                          triggered_from: "visualizer-modal",
                        });
                        onRemoveDataSource(source);
                      }}
                      data-testid="remove-datasource-button"
                      aria-label="Remove data source"
                    >
                      {t`Remove`}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              )}
              {!isLoading && !isSingleDataSource && (
                <Icon
                  style={{ flexShrink: 0 }}
                  className={S.ActionsButton}
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
  const dispatch = useDispatch();

  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: `${DRAGGABLE_ID.COLUMN}:${dataSource.id}:${column.name}`,
    data: {
      type: DRAGGABLE_ID.COLUMN,
      column,
      dataSource,
    },
  });

  const onMouseEnter = () => {
    dispatch(
      setHoveredItems([
        {
          id: column.name,
          data: {
            current: {
              type: "COLUMN",
              column,
              dataSource,
            },
          },
        },
      ]),
    );
  };
  const onMouseLeave = () => {
    dispatch(setHoveredItems(null));
  };

  return (
    <ColumnsListItem
      {...props}
      {...attributes}
      {...listeners}
      bg={isSelected ? "background-brand" : undefined}
      column={column}
      style={{ visibility: isDragging ? "hidden" : "visible" }}
      aria-selected={isSelected}
      data-testid="column-list-item"
      ref={setNodeRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}
