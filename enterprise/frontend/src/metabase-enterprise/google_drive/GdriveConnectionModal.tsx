import { type FormEvent, useState } from "react";
import { jt, t } from "ttag";

import { reloadSettings } from "metabase/admin/settings/settings";
import { skipToken, useGetUserQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { CopyButton } from "metabase/components/CopyButton";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUserName } from "metabase/lib/user";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Box,
  Button,
  Flex,
  Icon,
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

import Styles from "./Gdrive.module.css";
import { trackSheetImportClick } from "./analytics";

export function GdriveConnectionModal({
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
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
}) => (
  <Modal opened onClose={onClose} size="lg" padding="xl" title={title}>
    <Flex gap="md" pt="lg" direction="column">
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
      .catch((response) => {
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
            onChange={(e) => setFolderLink(e.target.value)}
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

  const gSheetsSetting = useSetting("gsheets");

  const connectingUserId = gSheetsSetting?.["created-by-id"];
  const folderUrl = gSheetsSetting?.folder_url;

  const { data: connectingUser } = useGetUserQuery(
    connectingUserId ? connectingUserId : skipToken,
  );

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
      .catch((response) => {
        setErrorMessage(response?.data?.message ?? "Something went wrong");
      });
  };

  const userName = getUserName(connectingUser);

  return (
    <ModalWrapper
      onClose={onClose}
      title={t`To add a new Google Drive folder, the existing one needs to be disconnected first`}
    >
      <Stack gap="md">
        <DriveConnectionDisplay
          folderUrl={folderUrl ?? ""}
          userName={userName ?? ""}
        />
        <Text c="text-medium" pb="md">
          {reconnect
            ? // eslint-disable-next-line no-literal-metabase-strings -- admin only string
              t`Only one folder can be synced with Metabase at a time. Your tables and Google Sheets will remain in place.`
            : t`Your existing tables and Google Sheets will remain in place but they will no longer be updated automatically.`}
        </Text>
        <Flex w="100%" gap="sm" justify="space-between">
          <Text c="error" ta="start">
            {errorMessage}
          </Text>
          <Flex justify="flex-end" gap="md">
            <Button variant="outline" onClick={onClose}>
              {t`Keep connected`}
            </Button>
            <Button
              variant="filled"
              color="danger"
              loading={isDeletingFolderLink}
              onClick={onDelete}
            >
              {t`Disconnect`}
            </Button>
          </Flex>
        </Flex>
      </Stack>
    </ModalWrapper>
  );
}
const DriveConnectionDisplay = ({
  folderUrl,
  userName,
}: {
  folderUrl: string;
  userName: string;
}) => (
  <ExternalLink href={folderUrl} target="_blank" className={Styles.plainLink}>
    <Flex
      bg="bg-light"
      w="100%"
      gap="sm"
      p="md"
      style={{ borderRadius: "0.5rem" }}
    >
      <Icon name="google_drive" mt="xs" />
      <Box>
        <Text fw="bold">{t`Google Drive connected`}</Text>
        <Text c="text-medium" fz="sm" lh="140%">
          {t`Connected by ${userName}`}
        </Text>
      </Box>
    </Flex>
  </ExternalLink>
);
