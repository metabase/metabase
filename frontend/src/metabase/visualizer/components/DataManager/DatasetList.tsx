import { useDraggable } from "@dnd-kit/core";
import { t } from "ttag";

import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, Icon, Text } from "metabase/ui";
import { DRAGGABLE_ID } from "metabase/visualizer/constants";
import {
  getDataSources,
  getDatasets,
  getExpandedDataSources,
  getReferencedColumns,
} from "metabase/visualizer/selectors";
import { isReferenceToColumn } from "metabase/visualizer/utils";
import {
  removeDataSource,
  toggleDataSourceExpanded,
} from "metabase/visualizer/visualizer.slice";
import type { VisualizerDataSource } from "metabase-types/store/visualizer";

import { ColumnListItem, type ColumnListItemProps } from "./ColumnListItem";
import S from "./DatasetList.module.css";

export const DatasetList = () => {
  const dataSources = useSelector(getDataSources);
  const datasets = useSelector(getDatasets);
  const expandedDataSources = useSelector(getExpandedDataSources);
  const referencedColumns = useSelector(getReferencedColumns);
  const dispatch = useDispatch();

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
        const isExpanded = expandedDataSources[source.id];

        return (
          <Box key={source.id} mb={4}>
            <Flex align="center" px={8} py={4} className={S.parent}>
              <Icon
                style={{ flexShrink: 0 }}
                name={isExpanded ? "chevronup" : "chevrondown"}
                aria-label={t`Expand`}
                size={12}
                mr={6}
                onClick={() => dispatch(toggleDataSourceExpanded(source.id))}
                cursor="pointer"
              />
              <Text truncate mr={4}>
                {source.name}
              </Text>
              <Icon
                style={{ flexShrink: 0 }}
                className={S.close}
                name="close"
                ml="auto"
                size={12}
                aria-label={t`Remove the dataset ${source.name} from the list`}
                onClick={() => dispatch(removeDataSource(source))}
                cursor="pointer"
              />
            </Flex>
            {isExpanded && dataset && dataset.data.cols && (
              <Box ml={12} mt={2}>
                {dataset.data.cols
                  .filter(column => !isPivotGroupColumn(column))
                  .map(column => (
                    <DraggableColumnListItem
                      key={column.name}
                      column={column}
                      dataSource={source}
                      isSelected={referencedColumns.some(ref =>
                        isReferenceToColumn(column, source.id, ref),
                      )}
                    />
                  ))}
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
