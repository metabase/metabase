import { type MouseEvent, forwardRef } from "react";
import { t } from "ttag";

import { displayNameForColumn } from "metabase/lib/formatting";
import {
  ActionIcon,
  Flex,
  type FlexProps,
  Icon,
  type IconName,
  Text,
} from "metabase/ui";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";
import type { DatasetColumn } from "metabase-types/api";

import S from "./ColumnListItem.module.css";

export interface ColumnListItemProps extends FlexProps {
  column: DatasetColumn;
  onRemove?: () => void;
  highlightedForDrag?: boolean;
}

export const ColumnListItem = forwardRef<HTMLDivElement, ColumnListItemProps>(
  function ColumnListItem(
    { column, onRemove, highlightedForDrag, ...props },
    ref,
  ) {
    const handleRemoveClick = (event: MouseEvent) => {
      event.stopPropagation();
      onRemove?.();
    };

    return (
      <Flex
        {...props}
        className={S.parent}
        mt={2}
        px={8}
        py={4}
        align="center"
        justify="space-between"
        ref={ref}
        style={
          highlightedForDrag
            ? {
                border: "2px solid var(--mb-color-brand)",
                boxShadow: "0px 1px 4px 1px var(--mb-color-shadow)",
                cursor: "grab",
                backgroundColor: "var(--mb-color-bg-light)",
                borderRadius: "var(--default-border-radius)",
              }
            : {}
        }
      >
        <Flex align="center">
          <Icon className={S.grabber} name="grabber" mr={4} size={16} />
          <Icon name={getIconForField(column) as IconName} mr={4} size={16} />
          <Text truncate>{displayNameForColumn(column)}</Text>
        </Flex>
        {!!onRemove && (
          <ActionIcon aria-label={t`Remove`} onClick={handleRemoveClick}>
            <Icon name="close" size={14} />
          </ActionIcon>
        )}
      </Flex>
    );
  },
);
