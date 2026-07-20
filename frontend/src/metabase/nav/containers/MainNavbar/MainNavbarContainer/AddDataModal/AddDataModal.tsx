import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useStorageSetup } from "metabase/common/components/upsells/StoragePurchaseModal";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Box, Icon, Modal, Tabs } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./AddDataModal.module.css";
import { CSVPanel } from "./Panels/CSVPanel";
import { DatabasesPanel } from "./Panels/DatabasesPanel";
import { PanelsHeader } from "./Panels/PanelsHeader";
import { trackAddDataEvent } from "./analytics";
import { useAddDataState } from "./use-add-data-state";
import { type AddDataTab, isValidTab } from "./utils";

interface AddDataModalProps {
  opened: boolean;
  onClose: () => void;

  initialTab?: AddDataTab;
  fromEmbeddingSetupGuide?: boolean;
}

interface Tabs {
  name: string;
  value: AddDataTab;
  iconName: IconName;
}

const DEFAULT_TAB = "db" satisfies AddDataTab;

const EVENT_MAPPING = {
  db: "database_tab_clicked",
  csv: "csv_tab_clicked",
  gsheets: "sheets_tab_clicked",
} as const satisfies Record<AddDataTab, string>;

export const AddDataModal = (props: AddDataModalProps) => (
  // Outside `Modal.Root` so setup state and its polling survive the modal
  // closing, and so the purchase modal it hosts replaces this one rather than
  // stacking. `enabled` defers the add-ons fetch until the modal is shown.
  <PLUGIN_UPLOAD_MANAGEMENT.StorageSetupProvider enabled={props.opened}>
    <AddDataModalContent {...props} />
  </PLUGIN_UPLOAD_MANAGEMENT.StorageSetupProvider>
);

const AddDataModalContent = ({
  opened,
  onClose,
  initialTab,
  fromEmbeddingSetupGuide,
}: AddDataModalProps) => {
  const { areUploadsEnabled, canManageUploads, isAdmin, hasAttachedDwh } =
    useAddDataState();
  const { isPurchaseModalOpened } = useStorageSetup();

  const [activeTab, setActiveTab] = useState<AddDataTab | null>(null);
  const isHosted = useSetting("is-hosted?");

  // Both CSV and Google Sheets stay visible even when the panel can only say
  // "contact an admin" — the tabs advertise what Metabase can do. Google Sheets
  // is conditional only on the instance being hosted.
  const tabs = useMemo(() => {
    const result: Tabs[] = [
      {
        name: t`Database`,
        value: "db",
        iconName: "database",
      },
      {
        name: t`CSV`,
        value: "csv",
        iconName: "table2",
      },
    ] satisfies Tabs[];

    if (isHosted) {
      result.push({
        name: t`Google Sheets`,
        value: "gsheets",
        iconName: "document",
      } satisfies Tabs);
    }

    return result;
  }, [isHosted]);

  const handleTabChange = (tabValue: string | null) => {
    if (tabValue === activeTab || !isValidTab(tabValue)) {
      return;
    }

    trackAddDataEvent(EVENT_MAPPING[tabValue]);

    setActiveTab(tabValue);
  };

  useEffect(() => {
    setActiveTab(initialTab ?? DEFAULT_TAB);
  }, [initialTab]);

  return (
    // Hides itself, but stays mounted, while the purchase confirmation is up,
    // so the confirmation replaces it instead of stacking on top of it.
    <Modal.Root
      opened={opened && !isPurchaseModalOpened}
      onClose={onClose}
      size="auto"
    >
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
              {tabs.map((tab) => (
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
              showUploadsLink={
                activeTab === "csv" && canManageUploads && areUploadsEnabled
              }
              showManageImports={
                activeTab === "gsheets" && isAdmin && hasAttachedDwh
              }
              onAddDataModalClose={onClose}
            />
            <Tabs.Panel value="db" className={S.panel}>
              <DatabasesPanel
                canSeeContent={isAdmin}
                fromEmbeddingSetupGuide={fromEmbeddingSetupGuide}
              />
            </Tabs.Panel>
            <Tabs.Panel value="csv" className={S.panel}>
              <CSVPanel onCloseAddDataModal={onClose} />
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
