import { useMemo } from "react";
import { c, t } from "ttag";

import { Box, Card, TreeTable } from "metabase/ui";
import {
  isAdminGroup,
  isDefaultGroup,
  isDefaultTenantGroup,
} from "metabase/utils/groups";

import { AdvancedGroupModeButton } from "./AdvancedGroupMode";
import S from "./AiFeatureAccessTable.module.css";
import { useAiFeaturesTreeTableInstance } from "./useAiFeaturesTreeTableInstance";
import type { AiFeatureAccessTableProps } from "./utils";

export function AiFeatureAccessTable(props: AiFeatureAccessTableProps) {
  const { groups, groupPermissions, advanced, activeTab, onPermissionChange } =
    props;

  const visibleGroups = useMemo(() => {
    if (advanced) {
      return groups.filter(
        (group) => !isDefaultGroup(group) && !isDefaultTenantGroup(group),
      );
    }

    if (activeTab === "tenant-groups") {
      return groups.filter(
        (group) => isAdminGroup(group) || isDefaultTenantGroup(group),
      );
    }

    return groups.filter(
      (group) => isAdminGroup(group) || isDefaultGroup(group),
    );
  }, [groups, advanced, activeTab]);

  const instance = useAiFeaturesTreeTableInstance(
    visibleGroups,
    groupPermissions,
    onPermissionChange,
  );

  const showSwitchButton = !advanced && activeTab === "user-groups";

  return (
    <Card
      withBorder
      p={0}
      radius="md"
      data-testid="ai-feature-access-table"
      className={S.card}
    >
      <TreeTable
        instance={instance}
        hierarchical={false}
        ariaLabel={t`AI feature access`}
        classNames={{
          row: S.row,
          cell: S.cell,
          headerCell: S.headerCell,
        }}
        styles={{
          // Using styles prop to override these instead of classNames because TreeTable uses the style prop internally :/
          cell: { paddingLeft: "1.5rem" },
          headerCell: { paddingLeft: "1.5rem" },
        }}
        getRowProps={(row) => ({
          "aria-label": c("{0} is the user group name")
            .t`${row.original.group.name} permissions`,
        })}
      />
      {showSwitchButton && (
        <Box className={S.buttonRow}>
          <AdvancedGroupModeButton />
        </Box>
      )}
    </Card>
  );
}
