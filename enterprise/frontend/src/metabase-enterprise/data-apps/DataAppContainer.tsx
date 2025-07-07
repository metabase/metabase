import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Stack,
  Title,
  Tooltip,
} from "metabase/ui";
import {
  createMockDataApp,
  getDataAppById,
} from "metabase-enterprise/data-apps/utils";

import { DataAppsComponentsList } from "./DataAppsComponentsList";
import { DataAppEditSettingsModal } from "./modals/DataAppEditSettingsModal";
import type { DataApp, DataAppEditSettings } from "./types";

type SettingsSectionKey = "components";

type DataAppContainerProps = {
  params: {
    appId: string;
  };
};

export const DataAppContainer = ({
  params: { appId },
}: DataAppContainerProps) => {
  const dispatch = useDispatch();

  const isNewApp = !appId;

  const [activeSettingsSection, setActiveSettingsSection] = useState<
    SettingsSectionKey | undefined
  >(isNewApp ? "components" : undefined); // show components list by default for new empty data app

  const [dataApp, setDataApp] = useState<DataApp | undefined>(() => {
    if (appId) {
      return getDataAppById(appId);
    }

    return createMockDataApp();
  });

  const [
    isOpenEditTitleModal,
    { open: openEditTitleModal, close: closeEditTitleModal },
  ] = useDisclosure(false);

  useMount(() => {
    dispatch(closeNavbar());
  });

  const handleEditSettingsSubmit = useCallback(
    (newSettings: DataAppEditSettings) => {
      if (!dataApp) {
        return;
      }

      setDataApp({
        ...dataApp,
        ...newSettings,
      });

      closeEditTitleModal();
    },
    [closeEditTitleModal, dataApp],
  );

  if (!dataApp) {
    return <div>{t`Not found`}</div>;
  }

  return (
    <>
      <Stack mih="100%" h="0" gap={0}>
        <Group
          bg="white"
          gap={0}
          py="0.5rem"
          px="2rem 1rem"
          justify="space-between"
          style={{
            borderBottom: "2px solid var(--mb-color-border)",
          }}
        >
          <Group gap="xs" align="center">
            <Title order={4}>{dataApp.name}</Title>
            <Tooltip label={t`Edit Data App Settings`}>
              <ActionIcon onClick={openEditTitleModal}>
                <Icon name="pencil" />
              </ActionIcon>
            </Tooltip>
          </Group>

          <Group>
            <ToolbarButton
              icon="add"
              aria-label={t`Add components`}
              tooltipLabel={t`Add components`}
              isActive={activeSettingsSection === "components"}
              onClick={() => setActiveSettingsSection("components")}
            />
          </Group>
        </Group>
        <Group
          bg="var(--mb-color-bg-light)"
          align="stretch"
          gap={0}
          style={{
            flexGrow: 1,
          }}
        >
          <Box
            style={{
              flexGrow: 1,
              backgroundImage:
                "radial-gradient(circle, var(--mb-color-border) 1px, transparent 0)",
              backgroundSize: "16px 16px",
              backgroundRepeat: "repeat",
            }}
          >
            {`Canvas here`}
          </Box>

          {activeSettingsSection === "components" && (
            <ComponentsSidebar
              onClose={() => setActiveSettingsSection(undefined)}
            />
          )}
        </Group>
      </Stack>

      <DataAppEditSettingsModal
        opened={isOpenEditTitleModal}
        dataApp={dataApp}
        onSubmit={handleEditSettingsSubmit}
        onClose={closeEditTitleModal}
      />
    </>
  );
};

type ComponentsSidebarProps = {
  onClose: () => void;
};
export const ComponentsSidebar = ({ onClose }: ComponentsSidebarProps) => {
  // TODO: use Sidebar component ?
  return (
    <Box
      style={{
        borderLeft: "1px solid var(--mb-color-border)",
        width: "20rem",
      }}
    >
      <Group
        bg="white"
        p="0.5rem 1rem"
        align="center"
        justify="space-between"
        mb="1rem"
      >
        <Title order={4}>{t`Components`}</Title>
        <ActionIcon onClick={onClose}>
          <Icon name="close" />
        </ActionIcon>
      </Group>

      <DataAppsComponentsList />
    </Box>
  );
};
