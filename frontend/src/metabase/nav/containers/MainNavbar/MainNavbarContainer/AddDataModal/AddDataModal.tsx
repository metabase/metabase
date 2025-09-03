import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Box, Icon, type IconName, Modal, Tabs } from "metabase/ui";

import S from "./AddDataModal.module.css";
import { CSVPanel } from "./Panels/CSVPanel";
import { DatabasesPanel } from "./Panels/DatabasesPanel";
import { PanelsHeader } from "./Panels/PanelsHeader";
import { trackAddDataEvent } from "./analytics";
import { useAddDataPermissions } from "./use-add-data-permission";
import { hasMeaningfulUploadableDatabases, isValidTab } from "./utils";

interface AddDataModalProps {
  opened: boolean;
  onClose: () => void;
}

interface Tabs {
  name: string;
  value: "csv" | "db" | "gsheets";
  isVisible: boolean;
  iconName: IconName;
}

export const AddDataModal = ({ opened, onClose }: AddDataModalProps) => {
  const { areUploadsEnabled, canUploadToDatabase, canManageUploads, isAdmin } =
    useAddDataPermissions();

  const { data: databasesResponse } = useListDatabasesQuery();
  const { data: uploadableDatabasesResponse } = useListDatabasesQuery({
    include_only_uploadable: true,
  });

  const hasUploadableDatabases = hasMeaningfulUploadableDatabases({
    allDatabases: databasesResponse?.data,
    allUploadableDatabases: uploadableDatabasesResponse?.data,
  });

  const shouldShowUploadsPanel = hasUploadableDatabases || canUploadToDatabase;

  const [activeTab, setActiveTab] = useState<Tabs["value"] | null>(null);

  const isHosted = useSetting("is-hosted?");

  const handleTabChange = (tabValue: string | null) => {
    if (tabValue === activeTab || !isValidTab(tabValue)) {
      return;
    }

    const eventMapping = {
      db: "database_tab_clicked",
      csv: "csv_tab_clicked",
      gsheets: "sheets_tab_clicked",
    } as const;

    trackAddDataEvent(eventMapping[tabValue]);
    setActiveTab(tabValue);
  };

  const tabs = useMemo(() => {
    return [
      {
        name: t`CSV`,
        value: "csv",
        isVisible: shouldShowUploadsPanel,
        iconName: "table2",
      },
      { name: t`Database`, value: "db", isVisible: true, iconName: "database" },
      {
        name: t`Google Sheets`,
        value: "gsheets",
        isVisible: isHosted,
        iconName: "document",
      },
    ] satisfies Tabs[];
  }, [shouldShowUploadsPanel, isHosted]);

  useEffect(() => {
    const firstVisibleTab = tabs.find((tab) => tab.isVisible);
    if (firstVisibleTab) {
      setActiveTab(firstVisibleTab.value);
    }
  }, [tabs]);

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
            tabLabel: S.tabLabel,
          }}
          h="100%"
        >
          <Box component="nav" w="14rem" className={CS.borderRight}>
            <Box component="header" className={S.header}>
              <Modal.Title fz="lg">{t`Add data`}</Modal.Title>
            </Box>
            <Tabs.List px="md" pb="lg">
              {tabs
                .filter((tab) => tab.isVisible)
                .map((tab) => (
                  <Tabs.Tab
                    key={tab.value}
                    value={tab.value}
                    leftSection={<Icon name={tab.iconName} />}
                  >
                    {tab.name}
                  </Tabs.Tab>
                ))}
            </Tabs.List>
          </Box>
          <Box component="main" w="30rem" className={S.panelContainer}>
            <PanelsHeader
              showDatabasesLink={activeTab === "db" && isAdmin}
              showUploadsLink={activeTab === "csv" && canManageUploads}
              showManageImports={activeTab === "gsheets" && isAdmin}
              onAddDataModalClose={onClose}
            />
            <Tabs.Panel value="csv" className={S.panel}>
              <CSVPanel
                onCloseAddDataModal={onClose}
                uploadsEnabled={areUploadsEnabled}
                canUpload={canUploadToDatabase}
                canManageUploads={canManageUploads}
              />
            </Tabs.Panel>
            <Tabs.Panel value="db" className={S.panel}>
              <DatabasesPanel canSeeContent={isAdmin} />
            </Tabs.Panel>
            <Tabs.Panel value="gsheets" className={S.panel}>
              <PLUGIN_UPLOAD_MANAGEMENT.GdriveAddDataPanel
                onAddDataModalClose={onClose}
              />
            </Tabs.Panel>
          </Box>
        </Tabs>
      </Modal.Content>
    </Modal.Root>
  );
};
