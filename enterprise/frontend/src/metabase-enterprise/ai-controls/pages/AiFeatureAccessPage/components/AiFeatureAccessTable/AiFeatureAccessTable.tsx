import { useMemo } from "react";
import { c, t } from "ttag";

import { Box, Card, TreeTable } from "metabase/ui";

import S from "../../../../components/AccessTable.module.css";
import { AdvancedGroupModeButton } from "../../../../components/AdvancedGroupMode";
import { getVisibleGroups } from "../../../../utils";

import { useAiFeaturesTreeTableInstance } from "./useAiFeaturesTreeTableInstance";
import type { AiFeatureAccessTableProps } from "./utils";

export function AiFeatureAccessTable(props: AiFeatureAccessTableProps) {
  const {
    groups,
    groupPermissions,
    advanced,
    activeTab,
    isEnablingAdvanced,
    onEnableAdvanced,
    onPermissionChange,
  } = props;

  const visibleGroups = useMemo(
    () => getVisibleGroups(groups, advanced, activeTab),
    [groups, advanced, activeTab],
  );

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
      radius="sm"
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
          rowActive: S.rowActive,
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
          <AdvancedGroupModeButton
            message={t`This will remove all AI feature access from the "All Users" group, so users won't have access to AI features unless they're added to a group that has access.`}
            loading={isEnablingAdvanced}
            onConfirm={onEnableAdvanced}
          />
        </Box>
      )}
    </Card>
  );
}
