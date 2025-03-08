import { useDraggable } from "@dnd-kit/core";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, Icon, Loader, Text } from "metabase/ui";
import { DRAGGABLE_ID } from "metabase/visualizer/constants";
import {
  getDataSources,
  getDatasets,
  getExpandedDataSources,
  getLoadingDatasets,
  getReferencedColumns,
} from "metabase/visualizer/selectors";
import { isReferenceToColumn } from "metabase/visualizer/utils";
import {
  addColumn,
  removeColumn,
  removeDataSource,
  toggleDataSourceExpanded,
} from "metabase/visualizer/visualizer.slice";
import type { DatasetColumn } from "metabase-types/api";
import type { VisualizerDataSource } from "metabase-types/store/visualizer";

import { ColumnListItem, type ColumnListItemProps } from "./ColumnListItem";
import S from "./DatasetList.module.css";

export const DatasetList = () => {
  const dataSources = useSelector(getDataSources);
  const datasets = useSelector(getDatasets);
  const loadingDatasets = useSelector(getLoadingDatasets);
  const expandedDataSources = useSelector(getExpandedDataSources);
  const referencedColumns = useSelector(getReferencedColumns);
  const dispatch = useDispatch();

  const handleAddColumn = (
    dataSource: VisualizerDataSource,
    column: DatasetColumn,
  ) => {
    dispatch(addColumn({ dataSource, column }));
  };

  const handleRemoveColumn = (columnRefName: string) => {
    dispatch(removeColumn({ name: columnRefName }));
  };

  return (
    <Flex
      px={12}
      direction="column"
      style={{
        overflowY: "auto",
      }}
    >
      {dataSources.map(source => {
        const dataset = datasets[source.id];
        const isLoading = loadingDatasets[source.id];
        const isExpanded = expandedDataSources[source.id];

        return (
          <Box key={source.id} mb={4}>
            <Flex align="center" px={8} py={4} className={S.parent}>
              {!isLoading ? (
                <Icon
                  style={{ flexShrink: 0 }}
                  name={isExpanded ? "chevronup" : "chevrondown"}
                  aria-label={t`Expand`}
                  size={12}
                  mr={6}
                  cursor="pointer"
                  onClick={() => dispatch(toggleDataSourceExpanded(source.id))}
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
                  aria-label={t`Remove the dataset ${source.name} from the list`}
                  cursor="pointer"
                  onClick={() => dispatch(removeDataSource(source))}
                />
              )}
            </Flex>
            {isExpanded && dataset && dataset.data.cols && (
              <Box ml={12} mt={2}>
                {dataset.data.cols.map(column => {
                  const columnReference = referencedColumns.find(ref =>
                    isReferenceToColumn(column, source.id, ref),
                  );
                  const isSelected = !!columnReference;
                  return (
                    <DraggableColumnListItem
                      key={column.name}
                      column={column}
                      dataSource={source}
                      isSelected={isSelected}
                      onClick={() => {
                        if (!isSelected) {
                          handleAddColumn(source, column);
                        }
                      }}
                      onRemove={
                        isSelected
                          ? () => handleRemoveColumn(columnReference.name)
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

type DraggableColumnListItemProps = ColumnListItemProps & {
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
    <ColumnListItem
      {...props}
      {...attributes}
      {...listeners}
      bg={isSelected ? "var(--mb-color-brand-lighter)" : undefined}
      column={column}
      style={{ visibility: isDragging ? "hidden" : "visible" }}
      ref={setNodeRef}
    />
  );
}
