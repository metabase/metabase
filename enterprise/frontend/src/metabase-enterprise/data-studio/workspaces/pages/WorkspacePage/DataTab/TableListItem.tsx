import cx from "classnames";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Icon,
  type IconName,
  Loader,
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
  isRunning?: boolean;
  onTransformClick?: (transform: WorkspaceTransformItem) => void;
  onTableClick?: (table: OpenTable) => void;
  onRunTransform?: (transform: WorkspaceTransformItem) => void;
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
  isRunning = false,
  onTransformClick,
  onTableClick,
  onRunTransform,
}: TableListItemProps) => {
  const displayName = schema ? `${schema}.${name}` : name;

  const handleTransformClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (transform && onTransformClick) {
      onTransformClick(transform);
    }
  };

  const handleTableClick = () => {
    if (isRunning) {
      return;
    }
    if (tableId && onTableClick) {
      onTableClick({ tableId, name, schema, transformId: transform?.ref_id });
    } else if (type === "output" && transform && onRunTransform) {
      onRunTransform(transform);
    }
  };

  const hasResults = type === "output" && !!tableId;
  const canRunTransform =
    type === "output" && !hasResults && transform && onRunTransform;
  const isClickable = (tableId && onTableClick) || canRunTransform;
  const displayTooltip = type !== "input" && !hasResults && !isRunning;

  return (
    <Box
      className={cx(S.root, {
        [S.selected]: isSelected,
        [S.clickable]: isClickable,
      })}
      aria-label={displayName}
      onClick={isClickable ? handleTableClick : undefined}
    >
      {isRunning ? (
        <Loader size="xs" />
      ) : (
        <Icon
          name={icon}
          size={14}
          c={type === "input" ? "saturated-green" : "saturated-yellow"}
        />
      )}
      <Tooltip
        label={
          isRunning
            ? t`Running transform...`
            : t`Run transform to see the results`
        }
        position="top"
        disabled={!displayTooltip && !isRunning}
      >
        <Text
          className={S.name}
          c={displayTooltip ? "text-light" : "text-dark"}
          truncate
        >
          {displayName}
        </Text>
      </Tooltip>
      {hasChanges && <StatusDot />}
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
