import cx from "classnames";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Sortable } from "metabase/common/components/Sortable";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { ColumnFormatControl } from "metabase/scaffolding/components/ColumnFormatControl";
import {
  ActionIcon,
  Box,
  Card,
  Flex,
  Icon,
  Text,
  Tooltip,
  rem,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import S from "./SortableFieldItem.module.css";

interface Props {
  disabled?: boolean;
  field: Field;
  isHidden?: boolean;
  parent?: Field | undefined;
  view: "table" | "list" | "gallery";
  style?: "normal" | "bold" | "dim" | "title";
  onStyleChange?: (
    field: Field,
    style: "normal" | "bold" | "dim" | "title",
  ) => void;
  onToggleVisibility: (field: Field) => void;
}

export const SortableFieldItem = ({
  disabled,
  field,
  isHidden,
  parent,
  view,
  onToggleVisibility,
  onStyleChange,
  style = "normal",
}: Props) => {
  const id = getRawTableFieldId(field);
  const icon = getColumnIcon(Lib.legacyColumnTypeInfo(field));
  const label = field.display_name;
  const draggable = !disabled;

  return (
    <Sortable
      className={cx(S.sortableField)}
      disabled={disabled}
      draggingStyle={{ opacity: 0.5 }}
      id={id}
    >
      <Card
        aria-label={label}
        bg="bg-white"
        c="text-medium"
        className={cx(S.card, {
          [S.draggable]: draggable,
        })}
        draggable={draggable}
        role="listitem"
        p={0}
        withBorder
      >
        <Flex
          gap={0}
          mih={rem(40)}
          pos="relative"
          px="md"
          py={rem(12)}
          w="100%"
          wrap="nowrap"
        >
          {draggable && (
            <Icon
              className={S.grabber}
              flex="0 0 auto"
              mr="sm"
              name="grabber"
              style={{
                opacity: isHidden ? 0.5 : 1,
              }}
            />
          )}

          <Icon
            className={S.icon}
            flex="0 0 auto"
            mr="sm"
            name={icon}
            style={{
              color: isHidden ? "var(--mb-color-text-primary)" : undefined,
              opacity: isHidden ? 0.5 : 1,
            }}
          />

          {parent && (
            <Box
              data-testid="name-prefix"
              flex="0 0 auto"
              lh="normal"
              maw="50%"
              mr="xs"
              style={{
                opacity: isHidden ? 0.5 : 1,
              }}
            >
              <Ellipsified lines={1} tooltip={parent.display_name}>
                {parent.display_name}
                {":"}
              </Ellipsified>
            </Box>
          )}

          <Text
            flex="1"
            fw="bold"
            lh="normal"
            lineClamp={1}
            style={{
              opacity: isHidden ? 0.5 : 1,
            }}
          >
            {label}
          </Text>

          <Tooltip label={isHidden ? t`Unhide column` : t`Hide column`}>
            <ActionIcon
              aria-label={isHidden ? t`Unhide column` : t`Hide column`}
              mb={-8}
              mt={-6}
              variant="transparent"
              onClick={() => onToggleVisibility(field)}
            >
              <Box c="text-medium">
                <Icon name={isHidden ? "eye_crossed_out" : "eye"} />
              </Box>
            </ActionIcon>
          </Tooltip>

          {onStyleChange && (
            <ColumnFormatControl
              style={style}
              onStyleChange={(style) => onStyleChange(field, style)}
              hasTitleOption={view !== "table"}
              actionIconProps={{
                mb: -8,
                mt: -5,
                ml: 8,
              }}
            />
          )}
        </Flex>
      </Card>
    </Sortable>
  );
};
