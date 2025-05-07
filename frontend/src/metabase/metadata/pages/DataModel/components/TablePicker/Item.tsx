import cx from "classnames";

import Link from "metabase/core/components/Link";
import { Box, Flex, Icon } from "metabase/ui";

import { getUrl } from "../../utils";

import S from "./TablePicker.module.css";
import { type TreePath, getIconForType, hasChildren } from "./utils";

export function ItemRow({
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
}) {
  return (
    <Box className={cx(S.item, S[type])} style={style}>
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
        <Flex align="center" gap="sm" direction="row" mb="xs">
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
}
