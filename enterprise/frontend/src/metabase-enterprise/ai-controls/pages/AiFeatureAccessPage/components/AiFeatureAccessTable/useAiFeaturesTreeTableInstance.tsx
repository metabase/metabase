import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { type TreeTableColumnDef, useTreeTableInstance } from "metabase/ui";
import {
  AIToolKey,
  type GroupInfo,
  type MetabotGroupPermission,
} from "metabase-types/api";

import { AiFeaturesCell } from "./AiFeaturesCell";
import { AiToolCell } from "./AiToolCell";
import type { AiFeatureAccessRow, AiFeatureAccessTableProps } from "./utils";

export function useAiFeaturesTreeTableInstance(
  visibleGroups: GroupInfo[],
  groupPermissions: MetabotGroupPermission[],
  onPermissionChange: AiFeatureAccessTableProps["onPermissionChange"],
) {
  const permissionsByGroup = useMemo(
    () => _.groupBy(groupPermissions, "group_id"),
    [groupPermissions],
  );

  const rows = useMemo<AiFeatureAccessRow[]>(
    () =>
      visibleGroups.map((group) => ({
        id: group.id,
        group,
        permissions: _.indexBy(permissionsByGroup[group.id] ?? [], "perm_type"),
        isAdminGroup: group.magic_group_type === "admin",
      })),
    [visibleGroups, permissionsByGroup],
  );

  const columns = useMemo<TreeTableColumnDef<AiFeatureAccessRow>[]>(
    () => [
      {
        id: "ai-features",
        header: t`AI features`,
        cell: ({ row }) => (
          <AiFeaturesCell
            onPermissionChange={onPermissionChange}
            {...row.original}
          />
        ),
      },
      ...[
        { key: AIToolKey.ChatAndNLQ, label: t`Chat and NLQ` },
        { key: AIToolKey.SQLGeneration, label: t`SQL generation` },
        { key: AIToolKey.OtherTools, label: t`Other tools` },
      ].map<TreeTableColumnDef<AiFeatureAccessRow>>(({ key, label }) => ({
        id: key,
        header: label,
        maxWidth: 140,
        cell: ({ row }) => (
          <AiToolCell
            onPermissionChange={onPermissionChange}
            toolKey={key}
            toolLabel={label}
            {...row.original}
          />
        ),
      })),
    ],
    [onPermissionChange],
  );

  return useTreeTableInstance<AiFeatureAccessRow>({
    data: rows,
    columns,
    getNodeId: (row) => String(row.id),
  });
}
