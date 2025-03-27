import { useState } from "react";
import { useLocation } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { Button, Flex, Icon, Text } from "metabase/ui";

import { GdriveConnectionModal } from "./GdriveConnectionModal";
import { trackSheetConnectionClick } from "./analytics";
import { useShowGdrive } from "./utils";

export function GdriveDbMenu() {
  const [showModal, setShowModal] = useState(false);

  const url = useLocation();
  const databaseId = /databases\/(\d+)/.exec(url.pathname ?? "")?.[1];

  const { data: databaseInfo } = useGetDatabaseQuery(
    databaseId ? { id: Number(databaseId) } : skipToken,
  );

  const isDwh = databaseInfo?.is_attached_dwh;

  const gSheetsSetting = useSetting("gsheets");

  const showGdrive = useShowGdrive();

  if (!showGdrive || !isDwh) {
    return null;
  }

  const { status } = gSheetsSetting;

  const buttonText = match(status)
    .with("not-connected", () => t`Connect Google Sheets`)
    .with("loading", () => t`Google Sheets connecting...`)
    .with("complete", () => t`Disconnect`)
    .otherwise(() => t`Google Sheets`);

  return (
    <Flex align="center" gap="sm">
      {status === "complete" && (
        <Flex align="center" gap="xs">
          <Icon name="google_sheet" />
          <Text>{t`Connected to Google Sheets`}</Text>
        </Flex>
      )}
      <Text>{" · "}</Text>
      <Button
        p={0}
        variant="subtle"
        onClick={() => {
          setShowModal(true);
          trackSheetConnectionClick({ from: "db-page" });
        }}
        disabled={status === "loading"}
        leftSection={
          status === "complete" ? undefined : <Icon name="google_sheet" />
        }
      >
        {buttonText}
      </Button>
      <GdriveConnectionModal
        isModalOpen={showModal}
        onClose={() => setShowModal(false)}
        reconnect={false}
      />
    </Flex>
  );
}
