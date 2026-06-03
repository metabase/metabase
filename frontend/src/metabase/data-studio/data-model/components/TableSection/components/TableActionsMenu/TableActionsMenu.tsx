import { useState } from "react";
import { t } from "ttag";

import {
  useDiscardTablesFieldValuesMutation,
  useRescanTablesFieldValuesMutation,
  useSyncTablesSchemasMutation,
} from "metabase/api";
import {
  trackDataStudioTableFieldValuesDiscardStarted,
  trackDataStudioTableFieldsRescanStarted,
  trackDataStudioTableSchemaSyncStarted,
} from "metabase/data-studio/analytics";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_REPLACEMENT } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Button, Icon, Menu } from "metabase/ui";
import type { Table } from "metabase-types/api";

interface Props {
  table: Table;
}

export function TableActionsMenu({ table }: Props) {
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [syncTablesSchemas] = useSyncTablesSchemasMutation();
  const [rescanTablesFieldValues] = useRescanTablesFieldValuesMutation();
  const [discardTablesFieldValues] = useDiscardTablesFieldValuesMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const canReplaceSources = useSelector(PLUGIN_REPLACEMENT.canReplaceSources);

  const tableIds = [table.id];
  const showSyncItems = !table.db?.is_attached_dwh;

  // Don't render an empty menu when there's nothing to show.
  if (!showSyncItems && !canReplaceSources) {
    return null;
  }

  const handleSyncSchema = async () => {
    const { error } = await syncTablesSchemas({ table_ids: tableIds });
    if (error) {
      sendErrorToast(t`Failed to start sync`);
      trackDataStudioTableSchemaSyncStarted("failure");
    } else {
      sendSuccessToast(t`Sync triggered`);
      trackDataStudioTableSchemaSyncStarted("success");
    }
  };

  const handleRescan = async () => {
    const { error } = await rescanTablesFieldValues({ table_ids: tableIds });
    if (error) {
      sendErrorToast(t`Failed to start scan`);
      trackDataStudioTableFieldsRescanStarted("failure");
    } else {
      sendSuccessToast(t`Scan triggered`);
      trackDataStudioTableFieldsRescanStarted("success");
    }
  };

  const handleDiscard = async () => {
    const { error } = await discardTablesFieldValues({ table_ids: tableIds });
    if (error) {
      sendErrorToast(t`Failed to discard values`);
      trackDataStudioTableFieldValuesDiscardStarted("failure");
    } else {
      sendSuccessToast(t`Discard triggered`);
      trackDataStudioTableFieldValuesDiscardStarted("success");
    }
  };

  return (
    <>
      <Menu>
        <Menu.Target>
          <Button
            aria-label={t`More actions`}
            size="md"
            leftSection={<Icon name="ellipsis" size={16} />}
          />
        </Menu.Target>
        <Menu.Dropdown>
          <PLUGIN_REPLACEMENT.SourceReplacementButton>
            {({ isDisabled }) => (
              <Menu.Item
                leftSection={<Icon name="find_replace" />}
                disabled={isDisabled}
                onClick={() => setIsReplaceOpen(true)}
              >
                {t`Find and replace`}
              </Menu.Item>
            )}
          </PLUGIN_REPLACEMENT.SourceReplacementButton>
          {showSyncItems && (
            <>
              <Menu.Item
                leftSection={<Icon name="sync" />}
                onClick={handleSyncSchema}
              >
                {t`Re-sync schema`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="list" />}
                onClick={handleRescan}
              >
                {t`Re-scan field values`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="trash" />}
                onClick={handleDiscard}
              >
                {t`Discard cached field values`}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
      <PLUGIN_REPLACEMENT.SourceReplacementModal
        opened={isReplaceOpen}
        initialSource={{ id: Number(table.id), type: "table" }}
        triggeredFrom="table_list"
        onClose={() => setIsReplaceOpen(false)}
      />
    </>
  );
}
