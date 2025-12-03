import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Icon,
  type IconName,
  Text,
  Tooltip,
} from "metabase/ui";
import type { WorkspaceTransformItem } from "metabase-types/api";

import { StatusDot } from "../components/StatusDot/StatusDot";

import S from "./TableListItem.module.css";

type TableListItemProps = {
  name: string;
  schema?: string | null;
  icon?: IconName;
  type: "input" | "output";
  hasChanges?: boolean;
  transform?: WorkspaceTransformItem;
  onTransformClick?: (transform: WorkspaceTransformItem) => void;
};

export const TableListItem = ({
  name,
  schema,
  icon = "table",
  type,
  hasChanges = false,
  transform,
  onTransformClick,
}: TableListItemProps) => {
  const displayName = schema ? `${schema}.${name}` : name;

  const handleTransformClick = () => {
    if (transform && onTransformClick) {
      onTransformClick(transform);
    }
  };

  return (
    <Box className={S.root}>
      <Icon name={icon} size={14} c={type === "input" ? "orange" : "green"} />
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
