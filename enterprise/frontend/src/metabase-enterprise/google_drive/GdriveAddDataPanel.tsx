import { useDisclosure } from "@mantine/hooks";
import type { PropsWithChildren } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { BUY_STORAGE_URL, UpsellStorage } from "metabase/admin/upsells";
import { skipToken } from "metabase/api";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getSubpathSafeUrl } from "metabase/lib/urls";
import {
  CONTENT_MAX_WIDTH,
  ContactAdminAlert,
  INNER_WIDTH,
} from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal/Panels/AddDataModalEmptyStates";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Group,
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

import { getDisconnectModalStrings } from "./GdriveConnectionModal.strings";
import { trackSheetConnectionClick } from "./analytics";
import { getStatus, useDeleteGdriveFolderLink, useShowGdrive } from "./utils";

const PanelWrapper = ({
  title = t`Connect Google Sheets`,
  subtitle = t`Sync a spreadsheet or an entire Google Drive folder with your instance.`,
  isModalOpen,
  onModalClose,
  children,
}: PropsWithChildren<{
  title?: string;
  subtitle?: string;
  isModalOpen?: boolean;
  onModalClose?: () => void;
}>) => {
  const illustration = getSubpathSafeUrl(
    "app/assets/img/empty-states/google-sheet.svg",
  );

  return (
    <>
      <Stack gap="md" align="center" justify="center" pt="3rem">
        <Center component="img" src={illustration} w="3rem" />
        <Box component="header" ta="center" maw={CONTENT_MAX_WIDTH}>
          <Title order={2} size="h4" mb="xs">
            {title}
          </Title>
          <Text c="text-medium">{subtitle}</Text>
        </Box>
        {children}
      </Stack>
      {onModalClose && (
        <GdriveConnectionModal
          isModalOpen={!!isModalOpen}
          onClose={onModalClose}
          reconnect={true}
        />
      )}
    </>
  );
};

export const GdriveAddDataPanel = ({
  onAddDataModalClose,
}: {
  onAddDataModalClose: () => void;
}) => {
  const [
    areConnectionDetailsShown,
    { open: showConnectionDetails, close: closeConnectionDetails },
  ] = useDisclosure(false);

  const [isConnectionModalOpen, { open: openConnectionModal }] =
    useDisclosure(false);

  const {
    errorMessage: deleteError,
    isDeletingFolderLink,
    onDelete,
  } = useDeleteGdriveFolderLink({
    onSuccess: () => {
      // As soon as we disconnect, we want to show a new connection modal again
      closeConnectionDetails();
      openConnectionModal();
    },
  });

  const isAdmin = useSelector(getUserIsAdmin);
  const hasStorage = useHasTokenFeature("attached_dwh");

  const showGdrive = useShowGdrive();
  const { data: folder, error } = useGetGsheetsFolderQuery(
    !showGdrive ? skipToken : undefined,
    { refetchOnMountOrArgChange: 5 },
  );

  const folderUrl = folder?.url;

  const NO_STORAGE_SUBTITLE = t`To work with spreadsheets, you can add storage to your instance.`;
  // eslint-disable-next-line no-literal-metabase-strings -- admin only
  const ERROR_MESSAGE = t`Please check that the folder is shared with the Metabase Service Account.`;

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
        <ErrorAlert error={ERROR_MESSAGE} />
      </PanelWrapper>
    );
  }

  if (areConnectionDetailsShown) {
    const { title, bodyCopy, connectButtonText, disconnectButtonText } =
      getDisconnectModalStrings({ reconnect: true });

    return (
      <PanelWrapper title={title} subtitle={bodyCopy}>
        <Stack gap="sm" mt="sm">
          <Button
            variant="filled"
            color="danger"
            loading={isDeletingFolderLink}
            onClick={onDelete}
            w={INNER_WIDTH}
          >
            {disconnectButtonText}
          </Button>
          <Button
            variant="outline"
            onClick={closeConnectionDetails}
            disabled={isDeletingFolderLink}
            w={INNER_WIDTH}
          >
            {connectButtonText}
          </Button>
        </Stack>
        {deleteError && (
          <Text fz="sm" c="danger">
            {deleteError}
          </Text>
        )}
      </PanelWrapper>
    );
  }

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
            showConnectionDetails();
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
        <ErrorAlert
          // eslint-disable-next-line no-literal-metabase-strings -- admin only
          error={t`Metabase Storage is full. Add more storage to continue syncing.`}
        >
          <Group gap="sm" mt="sm" align="center">
            <CTALink href={BUY_STORAGE_URL} text={t`Add storage`} />
            <CTALink href={folderUrl} text={t`Go to Google Drive`} />
          </Group>
        </ErrorAlert>
      </PanelWrapper>
    );
  }

  const buttonText = match(status)
    .with("not-connected", () => t`Connect`)
    .with("syncing", () => t`Connecting...`)
    .with("error", () => t`Something went wrong`)
    .exhaustive();

  return (
    <PanelWrapper
      isModalOpen={isConnectionModalOpen}
      // We are closing the parent (Add data) modal so we don't have to explicitly
      // close the connection modal as well. It will be removed from DOM with its parent gone.
      onModalClose={onAddDataModalClose}
    >
      <Button
        variant="filled"
        w={INNER_WIDTH}
        onClick={() => {
          trackSheetConnectionClick({ from: "add-data-modal" });

          status === "not-connected"
            ? openConnectionModal()
            : showConnectionDetails();
        }}
      >
        {buttonText}
      </Button>

      {status === "error" && <ErrorAlert error={ERROR_MESSAGE} />}
    </PanelWrapper>
  );
};

const ErrorAlert = ({
  error,
  children,
}: PropsWithChildren<{ error?: string }>) => {
  if (!error) {
    return null;
  }

  return (
    <Alert
      icon={<Icon name="warning" c="danger" />}
      variant="outline"
      title={t`Couldn't sync Google Sheets`}
      w="100%"
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
      {children}
    </Alert>
  );
};

const CTALink = ({ href, text }: { href?: string; text: string }) => {
  if (!href) {
    return null;
  }

  return (
    <Anchor
      href={href}
      target="_blank"
      underline="never"
      variant="brand"
      fw="bold"
      fz="sm"
      p={0}
      lh={1}
    >
      {text}
    </Anchor>
  );
};
