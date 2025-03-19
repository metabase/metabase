import dayjs from "dayjs";
import { useState } from "react";
import { useLocation } from "react-use";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { Button, Flex, Icon, Loader, Menu, Text } from "metabase/ui";
import {
  useGetGsheetsFolderQuery,
  useSyncGsheetsFolderMutation,
} from "metabase-enterprise/api";

import { GdriveConnectionModal } from "./GdriveConnectionModal";
import { trackSheetConnectionClick } from "./analytics";
import { SYNC_INTERVAL_MINUTES } from "./constants";
import { useShowGdrive } from "./utils";

export function GdriveDbMenu() {
  const [showModal, setShowModal] = useState(false);

  const url = useLocation();
  const databaseId = /databases\/(\d+)/.exec(url.pathname ?? "")?.[1];

  const { data: databaseInfo } = useGetDatabaseQuery(
    databaseId ? { id: Number(databaseId) } : skipToken,
  );

  const isDwh = databaseInfo?.is_attached_dwh;
  const showGdrive = useShowGdrive();

  const { data: folderInfo } = useGetGsheetsFolderQuery(
    showGdrive ? undefined : skipToken,
  );

  if (!showGdrive || !isDwh || !folderInfo) {
    return null;
  }

  const { status } = folderInfo;

  if (status === "not-connected") {
    return (
      <>
        <Button
          variant="subtle"
          onClick={() => {
            setShowModal(true);
            trackSheetConnectionClick({ from: "db-page" });
          }}
          leftSection={<Icon name="google_sheet" />}
        >
          {t`Connect Google Sheets`}
        </Button>
        <GdriveConnectionModal
          isModalOpen={showModal}
          onClose={() => setShowModal(false)}
          reconnect={false}
        />
      </>
    );
  }

  return (
    <>
      <Menu>
        <Menu.Target>
          <Button
            variant="subtle"
            leftSection={<Icon name="google_sheet" />}
            rightSection={<Icon name="chevrondown" />}
          >
            {t`Google Sheets`}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <SyncNowButton disabled={status === "loading"} />
          <Menu.Item
            leftSection={<Icon name="close" />}
            fw="bold"
            disabled={status === "loading"}
            onClick={() => setShowModal(true)}
          >
            {t`Disconnect`}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Label>
            <MenuSyncStatus />
          </Menu.Label>
        </Menu.Dropdown>
      </Menu>
      <GdriveConnectionModal
        isModalOpen={showModal}
        onClose={() => setShowModal(false)}
        reconnect={false}
      />
    </>
  );
}
function SyncNowButton({ disabled }: { disabled: boolean }) {
  const [doSync, { isLoading }] = useSyncGsheetsFolderMutation();

  return (
    <Menu.Item
      disabled={disabled || isLoading}
      leftSection={<Icon name="sync" />}
      fw="bold"
      onClickCapture={async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        await doSync();
        // error handling?
      }}
    >
      {t`Sync now`}
    </Menu.Item>
  );
}

function MenuSyncStatus() {
  const { data: folderInfo } = useGetGsheetsFolderQuery();

  const lastSync = folderInfo?.["folder-upload-time"];
  const folderStatus = folderInfo?.status;

  const lastSyncRelative = lastSync
    ? dayjs.unix(lastSync).fromNow()
    : t`unknown`;

  const nextSyncRelative = lastSync
    ? dayjs.unix(lastSync).add(SYNC_INTERVAL_MINUTES, "minutes").fromNow()
    : t`a while`;

  return (
    <>
      {folderStatus === "loading" ? (
        <SyncingText />
      ) : (
        <Text fw="bold">{t`Next sync ${nextSyncRelative}`}</Text>
      )}
      <Text fz="sm">{t`Last synced ${lastSyncRelative}`}</Text>
    </>
  );
}

const SyncingText = () => (
  <Flex justify="space-between">
    <Text fw="bold">{t`Syncing`}</Text>
    <Loader size="xs" />
  </Flex>
);
