import { type FormEvent, useState } from "react";
import { match } from "ts-pattern";
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

import disconnectIllustration from "./disconnect.svg?component";

export function GsheetMenuItem({ onClick }: { onClick: () => void }) {
  const gSheetsSetting = useSetting("gsheets");
  const gSheetsEnabled = useSetting("show-google-sheets-integration");

  const { status } = gSheetsSetting;
  const userIsAdmin = useSelector(getUserIsAdmin);
  const { data: { email: serviceAccountEmail } = {} } =
    useGetServiceAccountQuery();

  // if (
  //   !gSheetsEnabled ||
  //   !gSheetsSetting ||
  //   !userIsAdmin ||
  //   !serviceAccountEmail
  // ) {
  //   return null;
  // }

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
    <Menu.Item onClick={onClick} disabled={status === "loading"}>
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
          <Button variant="subtle" onClick={onClick}>
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
}: {
  isModalOpen: boolean;
  onClose: () => void;
}) {
  const gSheetsSetting = useSetting("gsheets");
  const userIsAdmin = useSelector(getUserIsAdmin);
  const { data: { email: serviceAccountEmail } = {} } =
    useGetServiceAccountQuery();

  const gSheetsEnabled = useSetting("show-google-sheets-integration");

  // if (
  //   !gSheetsEnabled ||
  //   !gSheetsSetting ||
  //   !userIsAdmin ||
  //   !serviceAccountEmail
  // ) {
  //   console.error("Google Sheets integration is not enabled");
  //   return null;
  // }

  const { status, folder_url } = gSheetsSetting;

  return (
    isModalOpen &&
    (status === "not-connected" ? (
      <GoogleSheetsConnectModal
        onClose={onClose}
        serviceAccountEmail={serviceAccountEmail}
        folderUrl={folder_url}
      />
    ) : (
      <GoogleSheetsDisconnectModal onClose={onClose} reconnect={true} />
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
            2. {jt`Enter: ${(<strong>{serviceAccountEmail}</strong>)}`}
          </Text>
          <CopyButton value={serviceAccountEmail}></CopyButton>
        </Flex>
        <Box>
          <Text>3. {t`Click on Done`} </Text>
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
          <Text c="error" ta="center">
            {errorMessage}
          </Text>
        </Stack>
      </Flex>
    </ModalWrapper>
  );
}
