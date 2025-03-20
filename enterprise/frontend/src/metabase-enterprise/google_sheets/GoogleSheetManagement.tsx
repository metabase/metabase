import { type FormEvent, useState } from "react";
import { useLocation } from "react-use";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { reloadSettings } from "metabase/admin/settings/settings";
import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { CopyButton } from "metabase/components/CopyButton";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Box,
  Button,
  Center,
  Flex,
  Icon,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import {
  useDeleteGsheetsFolderLinkMutation,
  useGetServiceAccountQuery,
  useSaveGsheetsFolderLinkMutation,
} from "metabase-enterprise/api";

import { trackSheetConnectionClick, trackSheetImportClick } from "./analytics";
import disconnectIllustration from "./disconnect.svg?component";

export function GsheetConnectButton() {
  const url = useLocation();
  const databaseId = /databases\/(\d+)/.exec(url.pathname ?? "")?.[1];

  const { data: databaseInfo } = useGetDatabaseQuery(
    databaseId ? { id: Number(databaseId) } : skipToken,
  );

  const isDwh = databaseInfo?.is_attached_dwh;

  const [showModal, setShowModal] = useState(false);

  const gSheetsSetting = useSetting("gsheets");
  const gSheetsEnabled = useSetting("show-google-sheets-integration");

  const userIsAdmin = useSelector(getUserIsAdmin);

  const shouldGetServiceAccount = isDwh && gSheetsEnabled && userIsAdmin;

  const { data: { email: serviceAccountEmail } = {} } =
    useGetServiceAccountQuery(shouldGetServiceAccount ? undefined : skipToken);

  if (
    !gSheetsEnabled ||
    !gSheetsSetting ||
    !userIsAdmin ||
    !serviceAccountEmail ||
    !isDwh
  ) {
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
      <GsheetConnectionModal
        isModalOpen={showModal}
        onClose={() => setShowModal(false)}
        reconnect={false}
      />
    </Flex>
  );
}

export function GsheetMenuItem({ onClick }: { onClick: () => void }) {
  const gSheetsSetting = useSetting("gsheets");
  const gSheetsEnabled = useSetting("show-google-sheets-integration");

  const userIsAdmin = useSelector(getUserIsAdmin);
  const { data: { email: serviceAccountEmail } = {} } =
    useGetServiceAccountQuery();

  if (
    !gSheetsEnabled ||
    !gSheetsSetting ||
    !userIsAdmin ||
    !serviceAccountEmail
  ) {
    return null;
  }

  const { status } = gSheetsSetting;

  const handleClick = () => {
    trackSheetConnectionClick({ from: "left-nav" });
    onClick();
  };

  const buttonText = match(status)
    .with("not-connected", () => t`Connect Google Sheets`)
    .with("loading", () => t`Google Sheets`)
    .with("complete", () => t`Google Sheets`)
    .otherwise(() => t`Google Sheets`);

  const helperText = match(status)
    .with("not-connected", () => null)
    .with("loading", () => t`Importing files...`)
    .with("complete", () => t`Connected`)
    .otherwise(() => null);

  return (
    <Menu.Item onClick={handleClick} disabled={status === "loading"}>
      <Flex gap="sm" align="flex-start" justify="space-between" w="100%">
        <Flex>
          <Icon name="google_sheet" mt="xs" mr="sm" />
          <div>
            <Text
              fw="bold"
              c={status === "loading" ? "text-light" : "text-dark"}
            >
              {buttonText}
            </Text>
            {helperText && (
              <Text size="sm" c="text-medium">
                {helperText}
              </Text>
            )}
          </div>
        </Flex>
        {status === "complete" && (
          <Button variant="subtle" onClick={handleClick}>
            {t`Add New`}
          </Button>
        )}
      </Flex>
    </Menu.Item>
  );
}

export function GsheetConnectionModal({
  isModalOpen,
  onClose,
  reconnect,
}: {
  isModalOpen: boolean;
  onClose: () => void;
  reconnect: boolean;
}) {
  const gSheetsSetting = useSetting("gsheets");
  const userIsAdmin = useSelector(getUserIsAdmin);
  const { data: { email: serviceAccountEmail } = {} } =
    useGetServiceAccountQuery();

  const gSheetsEnabled = useSetting("show-google-sheets-integration");

  if (
    !gSheetsEnabled ||
    !gSheetsSetting ||
    !userIsAdmin ||
    !serviceAccountEmail
  ) {
    return null;
  }

  const { status, folder_url } = gSheetsSetting;

  return (
    isModalOpen &&
    (status === "not-connected" ? (
      <GoogleSheetsConnectModal
        onClose={onClose}
        serviceAccountEmail={serviceAccountEmail ?? "email not found"}
        folderUrl={folder_url}
      />
    ) : (
      <GoogleSheetsDisconnectModal onClose={onClose} reconnect={reconnect} />
    ))
  );
}

const ModalWrapper = ({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) => (
  <Modal opened onClose={onClose} size="lg">
    <Flex px="lg" pb="lg" gap="md" direction="column">
      {children}
    </Flex>
  </Modal>
);

function GoogleSheetsConnectModal({
  onClose,
  folderUrl,
  serviceAccountEmail,
}: {
  onClose: () => void;
  folderUrl: string | null;
  serviceAccountEmail: string;
}) {
  const dispatch = useDispatch();
  const [folderLink, setFolderLink] = useState(folderUrl ?? "");
  const [errorMessage, setErrorMessage] = useState("");

  const [saveFolderLink, { isLoading: isSavingFolderLink }] =
    useSaveGsheetsFolderLinkMutation();

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage("");

    const validationRegex = /(https|http)\:\/\/drive\.google\.com\/.+/;

    if (!validationRegex.test(folderLink.trim())) {
      setErrorMessage(t`Invalid Google Drive folder link`);
      return;
    }

    trackSheetImportClick();
    await saveFolderLink({
      url: folderLink.trim(),
    })
      .unwrap()
      .then(() => {
        dispatch(reloadSettings());
        onClose();
      })
      .catch(response => {
        setErrorMessage(response?.data?.message ?? "Something went wrong");
      });
  };

  return (
    <ModalWrapper onClose={onClose}>
      <Text size="lg" fw="bold">
        {
          // eslint-disable-next-line no-literal-metabase-strings -- admin only string
          t`Share the Google Drive folder that contains your Google Sheets with Metabase`
        }
      </Text>
      <Flex
        bg="bg-light"
        style={{ borderRadius: "0.5rem" }}
        p="md"
        direction="column"
        gap="md"
      >
        <Box>
          <Text>
            1. {t`In Google Drive, right-click on the folder → Share`}
          </Text>
        </Box>
        <Flex align="center" justify="space-between">
          <Text>
            2.{" "}
            {jt`Enter: ${(<strong>{serviceAccountEmail ?? t`Error fetching service account email`}</strong>)}`}
          </Text>
          <CopyButton value={serviceAccountEmail}></CopyButton>
        </Flex>
        <Box>
          <Text>
            3.{" "}
            {jt`Select ${(<strong>{t`Viewer`}</strong>)} permissions, and click on ${(<strong>{t`Send`}</strong>)}`}
          </Text>
        </Box>
      </Flex>
      <form onSubmit={onSave}>
        <Box>
          <Text
            size="lg"
            fw="bold"
          >{t`Paste the sharing link for the folder`}</Text>
          <TextInput
            my="sm"
            disabled={isSavingFolderLink}
            value={folderLink}
            onChange={e => setFolderLink(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/abc123-xyz456"
          />
          <Text
            size="sm"
            color="secondary"
          >{t`In Google Drive, right-click on the folder → Share → Copy link`}</Text>
        </Box>
        <Flex justify="space-between" align="center" mt="sm" gap="md">
          <Text c="error" lh="1.2rem">
            {errorMessage}
          </Text>
          <Button
            type="submit"
            variant="filled"
            loading={isSavingFolderLink}
            disabled={folderLink.length < 3}
            style={{ flexShrink: 0 }}
          >
            {t`Import Google Sheets`}
          </Button>
        </Flex>
      </form>
    </ModalWrapper>
  );
}

function GoogleSheetsDisconnectModal({
  onClose,
  reconnect = false,
}: {
  onClose: () => void;
  reconnect: boolean;
}) {
  const [errorMessage, setErrorMessage] = useState("");
  const dispatch = useDispatch();

  const [deleteFolderLink, { isLoading: isDeletingFolderLink }] =
    useDeleteGsheetsFolderLinkMutation();

  const onDelete = async () => {
    setErrorMessage("");
    await deleteFolderLink()
      .unwrap()
      .then(() => {
        dispatch(reloadSettings());
        if (!reconnect) {
          onClose();
        }
      })
      .catch(response => {
        setErrorMessage(response?.data?.message ?? "Something went wrong");
      });
  };

  return (
    <ModalWrapper onClose={onClose}>
      <Flex justify="center" align="center" direction="column" gap="md" p="xl">
        <Center p="md">
          <Box component={disconnectIllustration} />
        </Center>
        <Text size="lg" fw="bold">
          {reconnect
            ? t`To add a new Google Drive folder, the existing one needs to be disconnected first.`
            : t`Disconnect from Google Drive?`}
        </Text>
        <Text>
          {reconnect
            ? // eslint-disable-next-line no-literal-metabase-strings -- admin only string
              t`Only one folder can be synced with Metabase at a time. Your tables and Google Sheets will remain in place.`
            : t`Your existing tables and Google Sheets will remain in place but they will no longer be updated automatically.`}
        </Text>
        <Stack mt="sm">
          <Stack w="13rem" mx="auto">
            <Button
              fullWidth
              variant="filled"
              color="danger"
              loading={isDeletingFolderLink}
              onClick={onDelete}
            >
              {t`Disconnect`}
            </Button>
            <Button fullWidth variant="outline" onClick={onClose}>
              {t`Keep connected`}
            </Button>
          </Stack>
          <Text c="error" ta="center">
            {errorMessage}
          </Text>
        </Stack>
      </Flex>
    </ModalWrapper>
  );
}
