import { type ChangeEvent, useEffect, useState } from "react";
import { t } from "ttag";

import { Checkbox, Flex } from "metabase/ui";
import { AIToolKey } from "metabase-types/api";

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
  const isMetabotEnabled =
    isAdminGroup || permissions[AIToolKey.Metabot]?.perm_value === "yes";
  const [isChecked, setIsChecked] = useState<boolean | undefined>();

  useEffect(() => {
    // Initialize local state
    if (permissions[toolKey] && isChecked === undefined) {
      setIsChecked(permissions[toolKey].perm_value === "yes");
    }
  }, [isChecked, permissions, toolKey]);

  return (
    <Flex align="center" justify="center" gap="xs" w="100%">
      <Checkbox
        aria-label={t`Allow ${group.name} user group to access ${toolLabel} AI tool.`}
        size="sm"
        checked={isChecked || isAdminGroup}
        // Admin group is always enabled and can't be changed
        disabled={isAdminGroup || !isMetabotEnabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setIsChecked(e.target.checked);
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
