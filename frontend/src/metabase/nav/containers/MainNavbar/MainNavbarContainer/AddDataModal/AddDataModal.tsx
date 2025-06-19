import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
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
  const { data: databaseResponse } = useListDatabasesQuery();

  const [activeTab, setActiveTab] = useState<string | null>("db");

  const isAdmin = useSelector(getUserIsAdmin);
  const userCanAccessSettings = useSelector(canAccessSettings);

  const databases = databaseResponse?.data;
  const uploadDbId = useSetting("uploads-settings")?.db_id;
  const uploadDB = databases?.find((db) => db.id === uploadDbId);

  /**
   * This covers the case where instance has the attached dwh. In such cases
   * uploads are enabled by default.
   */
  const areUploadsEnabled = !!uploadDbId;
  const canUploadToDatabase = !!uploadDB?.can_upload;
  const canManageUploads = userCanAccessSettings;

  const canManageDatabases = isAdmin;

  const handleTabChange = (tabValue: string | null) => {
    if (tabValue === activeTab || !isValidTab(tabValue)) {
      return;
    }

    const eventMapping = {
      db: "database_setup_clicked",
      csv: "csv_upload_clicked",
      gsheet: "sheets_connection_clicked",
    } as const;

    trackAddDataEvent(eventMapping[tabValue]);
    setActiveTab(tabValue);
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
