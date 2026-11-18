import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { PLUGIN_REPLACEMENT } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Button, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import { useTableSyncActions } from "./use-table-sync-actions";

interface Props {
  table: Table;
}

export function TableActionsMenu({ table }: Props) {
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const {
    syncSchema: handleSyncSchema,
    rescanFieldValues: handleRescan,
    discardFieldValues: handleDiscard,
  } = useTableSyncActions(table);

  const tableIds = [table.id];
  const showSyncItems = !table.db?.is_attached_dwh;
  const showReplaceItem = useSelector(PLUGIN_REPLACEMENT.canReplaceSources);
  const schemaViewerUrl = Urls.dataStudioSchemaViewer({
    databaseId: table.db_id,
    schema: table.schema,
    tableIds,
  });

  // Without sync actions and find-and-replace, the menu would hold only
  // "View schema", so render it directly as a button instead of a single-item menu.
  if (!showSyncItems && !showReplaceItem) {
    return (
      <Button
        component={ForwardRefLink}
        to={schemaViewerUrl}
        leftSection={<Icon name="network" size={16} />}
      >
        {t`View schema`}
      </Button>
    );
  }

  return (
    <>
      <Menu>
        <Menu.Target>
          <Button
            aria-label={t`More actions`}
            leftSection={<Icon name="ellipsis" size={16} />}
          />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            component={ForwardRefLink}
            to={schemaViewerUrl}
            leftSection={<Icon name="network" />}
          >
            {t`View schema`}
          </Menu.Item>

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
