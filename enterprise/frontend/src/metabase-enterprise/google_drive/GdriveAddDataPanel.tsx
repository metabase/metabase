import { useDisclosure } from "@mantine/hooks";
import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { getSubpathSafeUrl } from "metabase/lib/urls";
import { getStoreUrl } from "metabase/selectors/settings";
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
import { GdriveConnectionModal } from "metabase-enterprise/google_drive";
import {
  getErrorMessage,
  getStatus,
  useShowGdrive,
} from "metabase-enterprise/google_drive/utils";

export const GdriveAddDataPanel = () => {
  const [
    isConnectionModalOpen,
    { open: openConnectionModal, close: closeConnectionModal },
  ] = useDisclosure(false);
  const showGdrive = useShowGdrive();
  const { data: folder, error } = useGetGsheetsFolderQuery(
    !showGdrive ? skipToken : undefined,
    { refetchOnMountOrArgChange: 5 },
  );

  // if (!showGdrive) {
  //   return null;
  // }

  const status = getStatus({ status: folder?.status, error });

  const title =
    status === "active" ? t`Import Google Sheets` : t`Connect Google Sheets`;
  const subtitle = match(status)
    .with(
      "paused",
      // eslint-disable-next-line no-literal-metabase-strings -- admin only
      () => t`To work with spreadsheets, you can add storage to your Metabase.`,
    )
    .otherwise(
      () =>
        // eslint-disable-next-line no-literal-metabase-strings -- admin only
        t`Sync a spreadsheet or an entire Google Drive folder with Metabase.`,
    );

  const buttonText = match(status)
    .with("active", () => t`Connected`)
    .with("not-connected", () => t`Connect`)
    .with("syncing", () => t`Connecting...`)
    .with("paused", () => t`Connected`)
    .with("error", () => t`Something went wrong`)
    .exhaustive();

  // eslint-disable-next-line no-literal-metabase-strings -- admin only
  const storageFullError = t`Metabase Storage is full. Add more storage to continue syncing.`;

  const illustration = getSubpathSafeUrl(
    "app/assets/img/empty-states/google-sheet.svg",
  );

  return (
    <>
      <Center pt="3rem">
        <Stack gap="md" align="center" justify="center">
          <Center component="img" src={illustration} w="3rem" />
          <Box component="header" ta="center" maw="22.5rem">
            <Title order={2} size="h4" mb="xs">
              {title}
            </Title>
            <Text c="text-medium">{subtitle}</Text>
          </Box>

          <Button
            variant="filled"
            w="12.5rem"
            disabled={status !== "not-connected"}
            onClick={openConnectionModal}
          >
            {buttonText}
          </Button>
          {status === "active" && (
            <Button variant="subtle" onClick={openConnectionModal}>
              {t`Add new`}
            </Button>
          )}
          {status === "paused" && (
            <ErrorAlert error={storageFullError} upsell />
          )}
          {status === "error" && <ErrorAlert error={getErrorMessage(error)} />}
        </Stack>
      </Center>
      <GdriveConnectionModal
        isModalOpen={isConnectionModalOpen}
        onClose={closeConnectionModal}
        reconnect={true}
      />
    </>
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
          href={getStoreUrl("account")}
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
