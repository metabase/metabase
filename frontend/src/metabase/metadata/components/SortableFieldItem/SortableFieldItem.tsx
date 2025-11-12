import cx from "classnames";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Sortable } from "metabase/common/components/Sortable";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Card, Flex, Icon, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import S from "./SortableFieldItem.module.css";

interface Props {
  active?: boolean;
  disabled?: boolean;
  field: Field;
  parent?: Field | undefined;
}

export const SortableFieldItem = ({
  active,
  disabled,
  field,
  parent,
}: Props) => {
  const id = getRawTableFieldId(field);
  const icon = getColumnIcon(Lib.legacyColumnTypeInfo(field));
  const label = field.display_name;
  const draggable = !disabled;

  return (
    <Sortable
      className={cx(S.sortableField, {
        [S.active]: active,
      })}
      disabled={disabled}
      draggingStyle={{ opacity: 0.5 }}
      id={id}
    >
      <Card
        aria-label={label}
        bg={active ? "brand-light" : "background-primary"}
        c="text-secondary"
        className={cx(S.card, {
          [S.active]: active,
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
          <Icon className={S.icon} flex="0 0 auto" mr="sm" name={icon} />

          {parent && (
            <Box
              data-testid="name-prefix"
              flex="0 0 auto"
              lh="normal"
              maw="50%"
              mr="xs"
            >
              <Ellipsified lines={1} tooltip={parent.display_name}>
                {parent.display_name}
                {":"}
              </Ellipsified>
            </Box>
          )}

          <Text flex="1" fw="bold" lh="normal" lineClamp={1}>
            {label}
          </Text>

          {draggable && (
            <Icon
              className={S.grabber}
              flex="0 0 auto"
              ml="sm"
              name="grabber"
            />
          )}
        </Flex>
      </Card>
    </Sortable>
  );
};
