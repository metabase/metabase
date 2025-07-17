import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import { useCallback, useState } from "react";
import { replace } from "react-router-redux";
import { useMount } from "react-use";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Title,
  Tooltip,
} from "metabase/ui";
import {
  useGetDataAppQuery,
  useUpdateDataAppMutation,
} from "metabase-enterprise/api";
import { DataAppWidgetsCanvas } from "metabase-enterprise/data-apps/canvas/DataAppWidgetsCanvas";

import { DataAppsComponentsList } from "./DataAppsComponentsList";
import { DataAppEditSettingsModal } from "./modals/DataAppEditSettingsModal";
import { DataAppPublishModal } from "./modals/DataAppPublishModal";
import type { DataAppEditSettings, DataAppWidget } from "./types";

type SettingsSectionKey = "components";

const MOCK_COMPONENTS: DataAppWidget[] = [
  {
    id: "root",
    type: "section",
    childrenIds: ["1", "3"],
    options: {
      width: 3,
    },
  },
  {
    id: "1",
    type: "section",
    childrenIds: ["2"],
    options: {
      width: 1,
    },
  },
  {
    id: "2",
    type: "button",
    options: {
      text: "Testio 2",
    },
  },
  {
    id: "3",
    type: "button",
    options: {
      text: "Testio 3",
    },
  },
];

type DataAppContainerProps = {
  params: {
    appId: string;
  };
  location: Location<{ justCreated?: string }>;
};

export const DataAppContainer = ({
  params: { appId },
  location,
}: DataAppContainerProps) => {
  const dispatch = useDispatch();

  const isNewApp = !!location.query.justCreated;

  const [activeSettingsSection, setActiveSettingsSection] = useState<
    SettingsSectionKey | undefined
  >(isNewApp ? "components" : undefined); // show components list by default for new empty data app

  const [components, setComponents] = useState(MOCK_COMPONENTS);

  const { data: dataApp } = useGetDataAppQuery({ id: appId });
  const [updateDataApp] = useUpdateDataAppMutation();

  const [
    isOpenEditTitleModal,
    { open: openEditTitleModal, close: closeEditTitleModal },
  ] = useDisclosure(false);

  const [
    isOpenPublishModal,
    { open: openPublishModal, close: closePublishModal },
  ] = useDisclosure(false);

  useMount(() => {
    dispatch(closeNavbar());
  });

  useMount(() => {
    if (location.query.justCreated) {
      // remove "justCreated" query param
      dispatch(replace(window.location.pathname));
    }
  });

  const handleEditSettingsSubmit = useCallback(
    async (newSettings: DataAppEditSettings) => {
      if (!dataApp) {
        return;
      }

      await updateDataApp({
        id: dataApp.id,
        ...newSettings,
      });

      closeEditTitleModal();
    },
    [closeEditTitleModal, dataApp, updateDataApp],
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
            <Title order={4}>
              {dataApp.name}{" "}
              {dataApp.status === "archived" ? t`(Archived)` : ""}
            </Title>
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

            <Button
              data-testid="data-app-publish-button"
              px="md"
              py="sm"
              variant="subtle"
              onClick={openPublishModal}
            >
              {t`Share`}
            </Button>
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
          <DataAppWidgetsCanvas
            components={components}
            onComponentsUpdate={setComponents}
          />

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

      <DataAppPublishModal
        opened={isOpenPublishModal}
        dataApp={dataApp}
        onClose={closePublishModal}
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
