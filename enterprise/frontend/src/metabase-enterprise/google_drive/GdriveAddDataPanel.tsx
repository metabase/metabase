import { useDisclosure } from "@mantine/hooks";
import type { PropsWithChildren } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { BUY_STORAGE_URL, UpsellStorage } from "metabase/admin/upsells";
import { skipToken } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getSubpathSafeUrl } from "metabase/lib/urls";
import { ContactAdminAlert } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal/Panels/AddDataModalEmptyStates";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useGetGsheetsFolderQuery } from "metabase-enterprise/api";
import {
  DriveConnectionDisplay,
  GdriveConnectionModal,
} from "metabase-enterprise/google_drive";

import { trackSheetConnectionClick } from "./analytics";
import { getStatus, useShowGdrive } from "./utils";

const PanelWrapper = ({
  title = t`Connect Google Sheets`,
  subtitle = t`Sync a spreadsheet or an entire Google Drive folder with your instance.`,
  children,
}: PropsWithChildren<{
  title?: string;
  subtitle?: string;
}>) => {
  const illustration = getSubpathSafeUrl(
    "app/assets/img/empty-states/google-sheet.svg",
  );

  return (
    <Stack gap="md" align="center" justify="center" pt="3rem">
      <Center component="img" src={illustration} w="3rem" />
      <Box component="header" ta="center" maw="22.5rem">
        <Title order={2} size="h4" mb="xs">
          {title}
        </Title>
        <Text c="text-medium">{subtitle}</Text>
      </Box>
      {children}
    </Stack>
  );
};

export const GdriveAddDataPanel = () => {
  const [
    isConnectionModalOpen,
    { open: openConnectionModal, close: closeConnectionModal },
  ] = useDisclosure(false);

  const isAdmin = useSelector(getUserIsAdmin);
  const hasStorage = useHasTokenFeature("attached_dwh");

  const showGdrive = useShowGdrive();
  const { data: folder, error } = useGetGsheetsFolderQuery(
    !showGdrive ? skipToken : undefined,
    { refetchOnMountOrArgChange: 5 },
  );

  const NO_STORAGE_SUBTITLE = t`To work with spreadsheets, you can add storage to your instance.`;

  if (!isAdmin) {
    return (
      <PanelWrapper>
        <ContactAdminAlert reason="enable-google-sheets" />
      </PanelWrapper>
    );
  }

  if (!hasStorage) {
    return (
      <PanelWrapper subtitle={NO_STORAGE_SUBTITLE}>
        <UpsellStorage source="add-data-modal-sheets" />
      </PanelWrapper>
    );
  }

  // If a user is an admin of a hosted instance with storage but for some reason
  // any other condition from the `showGdrive` hook is not met, we show the general error
  if (!showGdrive) {
    return (
      <PanelWrapper>
        <ErrorAlert error={getErrorMessage({})} />
      </PanelWrapper>
    );
  }

  <GdriveConnectionModal
    isModalOpen={isConnectionModalOpen}
    onClose={closeConnectionModal}
    reconnect={true}
  />;

  // Finally, all conditions have been met, and all screens below this line depend only
  // on the status of the attempted connection
  const status = getStatus({ status: folder?.status, error });

  if (status === "active") {
    return (
      <PanelWrapper title={t`Import Google Sheets`}>
        <DriveConnectionDisplay />
        <Button
          variant="subtle"
          onClick={() => {
            trackSheetConnectionClick({ from: "add-data-modal" });
            openConnectionModal();
          }}
        >
          {t`Add new`}
        </Button>
      </PanelWrapper>
    );
  }

  if (status === "paused") {
    return (
      <PanelWrapper subtitle={NO_STORAGE_SUBTITLE}>
        <DriveConnectionDisplay />
        <ErrorAlert
          // eslint-disable-next-line no-literal-metabase-strings -- admin only
          error={t`Metabase Storage is full. Add more storage to continue syncing.`}
          upsell
        />
      </PanelWrapper>
    );
  }

  const buttonText = match(status)
    .with("not-connected", () => t`Connect`)
    .with("syncing", () => t`Connecting...`)
    .with("error", () => t`Something went wrong`)
    .exhaustive();

  return (
    <PanelWrapper>
      <Button
        variant="filled"
        w="12.5rem"
        disabled={status !== "not-connected"}
        onClick={() => {
          trackSheetConnectionClick({ from: "add-data-modal" });
          openConnectionModal();
        }}
      >
        {buttonText}
      </Button>

      {status === "error" && <ErrorAlert error={getErrorMessage(error)} />}
    </PanelWrapper>
  );
};

const ErrorAlert = ({
  error,
  upsell,
}: {
  error?: string;
  upsell?: boolean;
}) => {
  if (!error) {
    return null;
  }

  return (
    <Alert
      icon={<Icon name="warning" c="danger" />}
      variant="outline"
      title={t`Couldn't sync Google Sheets`}
      styles={{
        root: {
          backgroundColor: "transparent",
          border: "1px solid var(--mb-color-border)",
        },
        wrapper: {
          alignItems: "flex-start",
        },
        label: {
          fontSize: "var(--mantine-font-size-md)",
          color: "var(--mb-color-text-dark)",
        },
      }}
    >
      <Text fz="sm" lh="lg">
        {error}
      </Text>
      {upsell && (
        <Anchor
          href={BUY_STORAGE_URL}
          target="_blank"
          underline="never"
          variant="brand"
          fw="bold"
          fz="sm"
          p={0}
        >
          {t`Add storage`}
        </Anchor>
      )}
    </Alert>
  );
};
