import cx from "classnames";
import { type Ref, forwardRef } from "react";

import Link from "metabase/core/components/Link";
import { Box, Flex, Icon } from "metabase/ui";

import { getUrl } from "../../utils";

import S from "./Item.module.css";
import { type TreePath, getIconForType, hasChildren } from "./utils";

const INDENT_LEVEL = 16;
const TYPE_TO_LEVEL = {
  database: 0,
  schema: 1,
  table: 2,
};

export const ITEM_MIN_HEIGHT = 25;

export const ItemRow = forwardRef(function ItemRowInner(
  {
    type,
    onClick,
    style,
    label,
    isExpanded,
    value,
  }: {
    type: "database" | "schema" | "table";
    onClick?: () => void;
    style?: any;
    isExpanded?: boolean;
    label: string;
    value: TreePath;
  },
  ref: Ref<HTMLDivElement>,
) {
  const level = TYPE_TO_LEVEL[type];
  return (
    <Box
      ref={ref}
      mih={ITEM_MIN_HEIGHT}
      style={{
        ...style,
        marginLeft: level * INDENT_LEVEL,
      }}
    >
      <Link
        to={getUrl({
          databaseId: undefined,
          fieldId: undefined,
          schemaId: undefined,
          tableId: undefined,
          ...value,
        })}
        onClick={onClick}
      >
        <Flex align="center" gap="sm" direction="row" my="xs">
          {hasChildren(type) ? (
            <Icon
              name="chevronright"
              size={10}
              color="var(--mb-color-text-light)"
              className={cx(S.chevron, {
                [S.expanded]: isExpanded,
              })}
            />
          ) : null}
          <Icon name={getIconForType(type)} />
          {label}
        </Flex>
      </Link>
    </Box>
  );
});
