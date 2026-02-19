import {
  type CSSProperties,
  type MouseEvent,
  forwardRef,
  useMemo,
} from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { displayNameForColumn } from "metabase/lib/formatting";
import {
  ActionIcon,
  Flex,
  type FlexProps,
  Icon,
  type IconName,
} from "metabase/ui";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";
import type { DatasetColumn } from "metabase-types/api";

import S from "./ColumnsListItem.module.css";

export interface ColumnsListItemProps extends FlexProps {
  column: DatasetColumn;
  isDisabled?: boolean;
  onRemove?: () => void;
  highlightedForDrag?: boolean;
}

export const ColumnsListItem = forwardRef<HTMLDivElement, ColumnsListItemProps>(
  function ColumnsListItem(
    { column, isDisabled = false, onRemove, highlightedForDrag, ...props },
    ref,
  ) {
    const handleRemoveClick = (event: MouseEvent) => {
      event.stopPropagation();
      onRemove?.();
    };

    const style = useMemo(() => {
      const style: CSSProperties = {};
      if (isDisabled) {
        style.opacity = 0.5;
        style.pointerEvents = "none";
        return style;
      } else if (highlightedForDrag) {
        style.border = "2px solid var(--mb-color-brand)";
        style.boxShadow = "0px 1px 4px 1px var(--mb-color-shadow)";
        style.cursor = "grab";
        style.backgroundColor = "var(--mb-color-background-secondary)";
        style.borderRadius = "var(--default-border-radius)";
      }
      return style;
    }, [isDisabled, highlightedForDrag]);

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
        style={style}
      >
        <Flex align="center" miw={0}>
          <Icon
            className={S.grabber}
            name="grabber"
            mr={4}
            size={16}
            miw={16}
          />
          <Icon
            name={getIconForField(column) as IconName}
            mr={4}
            size={16}
            miw={16}
          />
          <Ellipsified>{displayNameForColumn(column)}</Ellipsified>
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
