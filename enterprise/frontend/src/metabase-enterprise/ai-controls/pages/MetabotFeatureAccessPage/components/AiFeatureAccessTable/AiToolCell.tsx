import type { ChangeEvent } from "react";
import { t } from "ttag";

import { Checkbox, Flex } from "metabase/ui";
import type { AIToolKey } from "metabase-types/api";

import type { AiFeatureAccessRow, AiFeatureAccessTableProps } from "./utils";

type AiToolCellProps = AiFeatureAccessRow & {
  toolKey: AIToolKey;
  toolLabel: string;
  onPermissionChange: AiFeatureAccessTableProps["onPermissionChange"];
};

export function AiToolCell(props: AiToolCellProps) {
  const {
    group,
    isAdminGroup,
    onPermissionChange,
    permissions,
    toolKey,
    toolLabel,
  } = props;
  const isChecked = isAdminGroup || permissions[toolKey]?.perm_value === "yes";

  return (
    <Flex align="center" justify="center" gap="xs" w="100%">
      <Checkbox
        aria-label={t`Allow ${group.name} user group to access ${toolLabel} AI tool.`}
        size="sm"
        checked={isChecked}
        // Admin group is always enabled and can't be changed
        disabled={isAdminGroup}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          onPermissionChange(
            group.id,
            toolKey,
            e.target.checked ? "yes" : "no",
          );
        }}
      />
    </Flex>
  );
}
