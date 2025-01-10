import { useState } from "react";
import { jt, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { CopyButton } from "metabase/components/CopyButton";
import { Box, Button, Flex, Icon, Modal, Text, TextInput } from "metabase/ui";
import { useSaveGsheetsFolderLinkMutation } from "metabase-enterprise/api";

export function GSheetManagement() {
  const gSheetsSetting = useSetting("gsheets");
  const [showModal, setShowModal] = useState(false);

  // const gSheetsEnabled = useSetting("show-google-sheets-integration");
  const gSheetsEnabled = true; // FIXME testing

  // TODO: should we limit this to admin only?

  if (!gSheetsEnabled || !gSheetsSetting) {
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
      {showModal && (
        <GoogleSheetsConnectModal
          onClose={() => setShowModal(false)}
          folderUrl={folder_url}
        />
      )}
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
}: {
  onClose: () => void;
  folderUrl: string | null;
}) {
  const [folderLink, setFolderLink] = useState(folderUrl ?? "");

  const [saveFolderLink, { isLoading: isSavingFolderLink }] =
    useSaveGsheetsFolderLinkMutation();

  // TODO get this from the api
  const serviceAccount = "metabase-service38u329@metabase.com";

  if (isSavingFolderLink) {
    return (
      <ModalWrapper onClose={onClose}>
        {t`Connecting to Google Sheets...`}
      </ModalWrapper>
    );
  }

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
          <Text>2. {jt`Enter: ${(<strong>{serviceAccount}</strong>)}`}</Text>
          <CopyButton value={serviceAccount}></CopyButton>
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
          onClick={async () => {
            const response = await saveFolderLink({
              url: folderLink.trim(),
            }).unwrap();

            if (response.success) {
              // TODO: refresh settings?
              onClose();
            } else {
              // TODO: show error
            }
          }}
        >
          {t`Import Google Sheets`}
        </Button>
      </Flex>
    </ModalWrapper>
  );
}
