import cx from "classnames";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Icon,
  type IconName,
  Text,
  Tooltip,
} from "metabase/ui";
import type { TableId, WorkspaceTransformItem } from "metabase-types/api";

import type { OpenTable } from "../WorkspaceProvider";
import { StatusDot } from "../components/StatusDot/StatusDot";

import S from "./TableListItem.module.css";

type TableListItemProps = {
  name: string;
  schema?: string | null;
  icon?: IconName;
  type: "input" | "output";
  hasChanges?: boolean;
  transform?: WorkspaceTransformItem;
  tableId?: TableId;
  isSelected?: boolean;
  onTransformClick?: (transform: WorkspaceTransformItem) => void;
  onTableClick?: (table: OpenTable) => void;
};

export const TableListItem = ({
  name,
  schema,
  icon = "table",
  type,
  hasChanges = false,
  transform,
  tableId,
  isSelected = false,
  onTransformClick,
  onTableClick,
}: TableListItemProps) => {
  const displayName = schema ? `${schema}.${name}` : name;

  const handleTransformClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (transform && onTransformClick) {
      onTransformClick(transform);
    }
  };

  const handleTableClick = () => {
    if (tableId && onTableClick) {
      onTableClick({ tableId, name, schema });
    }
  };

  const isClickable = tableId && onTableClick;

  return (
    <Box
      className={cx(S.root, {
        [S.selected]: isSelected,
        [S.clickable]: isClickable,
      })}
      onClick={isClickable ? handleTableClick : undefined}
    >
      <Icon
        name={icon}
        size={14}
        c={type === "input" ? "saturated-green" : "saturated-yellow"}
      />
      <Text className={S.name} c="text-dark" truncate>
        {displayName}
      </Text>
      {hasChanges && <StatusDot status="changed" />}
      {type === "output" && transform && (
        <Tooltip label={t`Open transform`} position="top">
          <ActionIcon
            className={S.actionIcon}
            ml="auto"
            size="sm"
            variant="subtle"
            onClick={handleTransformClick}
          >
            <Icon name="code_block" size={14} c="text-medium" />
          </ActionIcon>
        </Tooltip>
      )}
    </Box>
  );
};
