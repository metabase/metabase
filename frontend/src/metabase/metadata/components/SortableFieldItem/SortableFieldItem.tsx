import cx from "classnames";

import { Sortable } from "metabase/common/components/Sortable";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Card, Flex, Icon, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import S from "./SortableFieldItem.module.css";

interface Props {
  active?: boolean;
  disabled?: boolean;
  field: Field;
}

export const SortableFieldItem = ({ active, disabled, field }: Props) => {
  const id = getRawTableFieldId(field);
  const icon = getColumnIcon(Lib.legacyColumnTypeInfo(field));
  const label = field.display_name;
  const draggable = !disabled;

  return (
    <Sortable
      className={S.sortableField}
      disabled={disabled}
      draggingStyle={{ opacity: 0.5 }}
      id={id}
    >
      <Card
        aria-label={label}
        bg={active ? "brand-light" : "bg-white"}
        c="text-medium"
        className={cx(S.card, {
          [S.active]: active,
          [S.draggable]: draggable,
        })}
        draggable={draggable}
        role="listitem"
        shadow="xs"
        p={0}
        withBorder
      >
        <Flex
          gap="sm"
          justify="space-between"
          mih={rem(40)}
          pos="relative"
          px="md"
          py={rem(12)}
          w="100%"
          wrap="nowrap"
        >
          <Icon className={S.icon} name={icon} />

          <Text flex="1" fw="bold" lh="normal" lineClamp={1}>
            {label}
          </Text>

          {draggable && (
            <Icon className={S.grabber} flex="0 0 auto" name="grabber" />
          )}
        </Flex>
      </Card>
    </Sortable>
  );
};
