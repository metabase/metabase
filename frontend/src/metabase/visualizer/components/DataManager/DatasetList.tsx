import { useDraggable } from "@dnd-kit/core";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex, Icon, Text } from "metabase/ui";
import { DRAGGABLE_ID } from "metabase/visualizer/dnd/constants";
import {
  getDataSources,
  getDatasets,
  getExpandedDataSources,
  removeDataSource,
  toggleDataSourceExpanded,
} from "metabase/visualizer/visualizer.slice";

import { ColumnListItem, type ColumnListItemProps } from "./ColumnListItem";
import S from "./DatasetList.module.css";

export const DatasetList = () => {
  const dataSources = useSelector(getDataSources);
  const datasets = useSelector(getDatasets);
  const expandedDataSources = useSelector(getExpandedDataSources);
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
                {dataset.data.cols.map(column => (
                  <DraggableColumnListItem key={column.name} column={column} />
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Flex>
  );
};

function DraggableColumnListItem({ column, ...props }: ColumnListItemProps) {
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: column.name,
    data: {
      type: DRAGGABLE_ID.COLUMN,
      column,
    },
  });

  return (
    <ColumnListItem
      {...props}
      {...attributes}
      {...listeners}
      column={column}
      style={{ visibility: isDragging ? "hidden" : "visible" }}
      ref={setNodeRef}
    />
  );
}
