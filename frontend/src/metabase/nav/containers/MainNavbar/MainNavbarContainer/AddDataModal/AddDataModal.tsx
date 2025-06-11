import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useHasTokenFeature } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { canAccessSettings, getUserIsAdmin } from "metabase/selectors/user";
import { Box, Icon, Modal, Tabs } from "metabase/ui";

import S from "./AddDataModal.module.css";
import { CSVPanel } from "./Panels/CSVPanel";
import { DatabasesPanel } from "./Panels/DatabasesPanel";
import { PanelsHeader } from "./Panels/PanelsHeader";
import { trackAddDataEvent } from "./analytics";
import { isValidTab } from "./utils";

interface AddDataModalProps {
  opened: boolean;
  onClose: () => void;
}

export const AddDataModal = ({ opened, onClose }: AddDataModalProps) => {
  const { data: databaseResponse } = useListDatabasesQuery({
    include_only_uploadable: true,
  });

  const [activeTab, setActiveTab] = useState<string | null>("db");

  const isAdmin = useSelector(getUserIsAdmin);
  const userCanAccessSettings = useSelector(canAccessSettings);

  const hasAttachedDWHFeature = useHasTokenFeature("attached_dwh");
  const databases = databaseResponse?.data;
  const uploadDB = databases?.find((db) => db.uploads_enabled);

  /**
   * Uploads are always enabled for instances with the attached DWH.
   * It is not possible to turn the uploads off, nor to delete the attached database.
   */
  const areUploadsEnabled = hasAttachedDWHFeature || !!uploadDB;
  const canUploadToDatabase = !!uploadDB?.can_upload;

  const canManageUploads =
    isAdmin || (userCanAccessSettings && canUploadToDatabase);
  const canManageDatabases = isAdmin;

  const handleTabChange = (v: string | null) => {
    if (v === activeTab || !isValidTab(v)) {
      return;
    }

    const eventMapping = {
      db: "database_setup_clicked",
      csv: "csv_upload_clicked",
      gsheet: "sheets_connection_clicked",
    } as const;

    trackAddDataEvent(eventMapping[v]);
    setActiveTab(v);
  };

  return (
    <Modal.Root opened={opened} onClose={onClose} size="auto">
      <Modal.Overlay />
      <Modal.Content h="30rem">
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="none"
          orientation="vertical"
          classNames={{
            list: S.list,
            tab: S.tab,
          }}
          h="100%"
        >
          <Box component="nav" w="14rem" className={CS.borderRight}>
            <Box component="header" className={S.header}>
              <Modal.Title fz="lg">{t`Add data`}</Modal.Title>
            </Box>
            <Tabs.List px="md" pb="lg">
              <Tabs.Tab value="db" leftSection={<Icon name="database" />}>
                {t`Database`}
              </Tabs.Tab>
              <Tabs.Tab value="csv" leftSection={<Icon name="table2" />}>
                {t`CSV`}
              </Tabs.Tab>
            </Tabs.List>
          </Box>
          <Box component="main" w="30rem" className={S.panelContainer}>
            <PanelsHeader
              showDatabasesLink={activeTab === "db" && canManageDatabases}
              showUploadsLink={activeTab === "csv" && canManageUploads}
              onAddDataModalClose={onClose}
            />
            <Tabs.Panel value="db" className={S.panel}>
              <DatabasesPanel canSeeContent={isAdmin} />
            </Tabs.Panel>
            <Tabs.Panel value="csv" className={S.panel}>
              <CSVPanel
                onCloseAddDataModal={onClose}
                uploadsEnabled={areUploadsEnabled}
                canUpload={canUploadToDatabase}
                canManageUploads={canManageUploads}
              />
            </Tabs.Panel>
          </Box>
        </Tabs>
      </Modal.Content>
    </Modal.Root>
  );
};
