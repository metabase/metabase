import type { IconName } from "metabase/ui";
import { Box, Icon, Text } from "metabase/ui";

import { StatusDot } from "../components/StatusDot/StatusDot";

import S from "./TableListItem.module.css";

type TableListItemProps = {
  name: string;
  schema?: string | null;
  icon?: IconName;
  type: "input" | "output";
  hasChanges?: boolean;
};

export const TableListItem = ({
  name,
  schema,
  icon = "table",
  type,
  hasChanges = false,
}: TableListItemProps) => {
  const displayName = schema ? `${schema}.${name}` : name;

  return (
    <Box className={S.root}>
      <Icon name={icon} size={14} c={type === "input" ? "orange" : "green"} />
      <Text className={S.name} c="text-dark" truncate>
        {displayName}
      </Text>
      {hasChanges && <StatusDot status="changed" />}
      {type === "output" && (
        <Icon name="code_block" ml="auto" size={14} c="text-medium" />
      )}
    </Box>
  );
};
