import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  ActionIcon,
  Anchor,
  Box,
  FixedSizeIcon,
  Group,
  Tooltip,
} from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import * as Urls from "metabase/utils/urls";
import type { WorkspaceDivergedTable } from "metabase-types/api";

type SidebarHeaderProps = {
  table: WorkspaceDivergedTable;
  onClose: () => void;
};

export function SidebarHeader({ table, onClose }: SidebarHeaderProps) {
  const title = `${table.schema}.${table.table_name}`;
  const tableMetadataUrl =
    table.table_id != null
      ? Urls.dataStudioData({
          databaseId: table.database_id,
          schemaName: table.schema,
          tableId: table.table_id,
        })
      : null;

  return (
    <Group
      gap="0.75rem"
      wrap="nowrap"
      align="start"
      justify="space-between"
      data-testid="diverged-table-sidebar-header"
    >
      {tableMetadataUrl != null ? (
        <Anchor
          component={ForwardRefLink}
          fz="h3"
          fw="bold"
          lh="h3"
          to={tableMetadataUrl}
          target="_blank"
        >
          {title}
        </Anchor>
      ) : (
        <Box fz="h3" fw="bold" lh="h3">
          {title}
        </Box>
      )}
      <Group gap="xs" wrap="nowrap">
        {tableMetadataUrl != null && (
          <Tooltip label={t`View metadata`} openDelay={TOOLTIP_OPEN_DELAY}>
            <ActionIcon
              component={ForwardRefLink}
              to={tableMetadataUrl}
              target="_blank"
              aria-label={t`View metadata`}
            >
              <FixedSizeIcon name="external" />
            </ActionIcon>
          </Tooltip>
        )}
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
