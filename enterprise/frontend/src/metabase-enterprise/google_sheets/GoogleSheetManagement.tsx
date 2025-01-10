import { useState } from "react";
import { jt, t } from "ttag";

import { reloadSettings } from "metabase/admin/settings/settings";
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

export function GSheetManagement() {
  const gSheetsSetting = useSetting("gsheets");
  const [showModal, setShowModal] = useState(false);
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
    <>
      <Box py="lg" mx="md">
        <Button
          variant="subtle"
          leftIcon={<Icon name="google_sheet" />}
          onClick={() => setShowModal(true)}
        >
          {status === "not-connected"
            ? t`Connect Google Sheets`
            : t`Google Sheets connected`}
        </Button>
      </Box>
      {showModal &&
        (status === "connected" ? (
          <GoogleSheetsDisconnectModal
            onClose={() => setShowModal(false)}
            reconnect={true}
          />
        ) : (
          <GoogleSheetsConnectModal
            onClose={() => setShowModal(false)}
            serviceAccountEmail={serviceAccountEmail}
            folderUrl={folder_url}
          />
        ))}
    </>
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

  const [saveFolderLink, { isLoading: isSavingFolderLink }] =
    useSaveGsheetsFolderLinkMutation();

  const onSave = async () => {
    const response = await saveFolderLink({
      url: folderLink.trim(),
    }).unwrap();

    if (response.success) {
      dispatch(reloadSettings());
      onClose();
    } else {
      // TODO: show error
    }
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
            2. {jt`Enter: ${(<strong>{serviceAccountEmail}</strong>)}`}
          </Text>
          <CopyButton value={serviceAccountEmail}></CopyButton>
        </Flex>
        <Box>
          <Text>3. {t`Click on Done`} </Text>
        </Box>
      </Flex>
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
      <Flex justify="flex-end" mt="sm">
        <Button
          variant="filled"
          loading={isSavingFolderLink}
          disabled={folderLink.length < 3}
          onClick={onSave}
        >
          {t`Import Google Sheets`}
        </Button>
      </Flex>
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
  const dispatch = useDispatch();

  const [deleteFolderLink, { isLoading: isDeletingFolderLink }] =
    useDeleteGsheetsFolderLinkMutation();

  const onDelete = async () => {
    const response = await deleteFolderLink().unwrap();

    if (response.success) {
      dispatch(reloadSettings());
      // if we're reconnecting, leave the modal open
      if (!reconnect) {
        onClose();
      }
    } else {
      // TODO: show error
    }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <Flex justify="center" align="center" direction="column" gap="md" p="xl">
        <Center
          bg="bg-light"
          style={{ borderRadius: "50%" }}
          w="6rem"
          h="6rem"
          p="md"
        >
          {/* FIXME this icon needs help */}
          <Icon name="folder_disconnect" size={64} />
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
        <Stack mt="sm" w="13rem">
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
      </Flex>
    </ModalWrapper>
  );
}
