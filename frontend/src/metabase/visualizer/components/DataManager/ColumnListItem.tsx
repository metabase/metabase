import { forwardRef } from "react";

import { Flex, type FlexProps, Icon, type IconName, Text } from "metabase/ui";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";
import type { DatasetColumn } from "metabase-types/api";

import S from "./ColumnListItem.module.css";

export interface ColumnListItemProps extends FlexProps {
  column: DatasetColumn;
}

export const ColumnListItem = forwardRef<HTMLDivElement, ColumnListItemProps>(
  function ColumnListItem({ column, ...props }, ref) {
    return (
      <Flex
        {...props}
        px={8}
        py={4}
        align="center"
        ref={ref}
        className={S.parent}
      >
        <Icon className={S.grabber} name="grabber" mr={4} size={16} />
        <Icon name={getIconForField(column) as IconName} mr={4} size={16} />
        <Text truncate>{getFriendlyName(column)}</Text>
      </Flex>
    );
  },
);
