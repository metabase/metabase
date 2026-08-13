import type { ChangeEvent } from "react";
import { t } from "ttag";

import { Flex, Switch, Text } from "metabase/ui";
import { AIToolKey } from "metabase-types/api";

import type { AiFeatureAccessRow, AiFeatureAccessTableProps } from "./utils";

type AiToolCellProps = AiFeatureAccessRow & {
  onPermissionChange: AiFeatureAccessTableProps["onPermissionChange"];
};

export function AiFeaturesCell(props: AiToolCellProps) {
  const { group, permissions, isAdminGroup, onPermissionChange } = props;
  const isEnabled = permissions[AIToolKey.Metabot]?.perm_value === "yes";

  return (
    <Flex align="center" gap="sm">
      <Switch
        aria-label={t`Allow ${group.name} user group to access AI features.`}
        size="xs"
        checked={isEnabled || isAdminGroup}
        // Admin group is always enabled and can't be changed
        disabled={isAdminGroup}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          onPermissionChange(
            group.id,
            AIToolKey.Metabot,
            e.target.checked ? "yes" : "no",
          );
        }}
      />
      <Text>{group.name}</Text>
    </Flex>
  );
}
