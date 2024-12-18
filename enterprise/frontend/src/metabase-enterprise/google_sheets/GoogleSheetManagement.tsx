import { useEffect, useState } from "react";
import { c, t } from "ttag";

import { skipToken } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import {
  Box,
  Button,
  Center,
  Divider,
  Flex,
  Modal,
  Text,
  TextInput,
} from "metabase/ui";
import {
  useGetGsheetsOauthStatusQuery,
  useInitiateOauthMutation,
  useSaveGsheetsFolderLinkMutation,
} from "metabase-enterprise/api";

const AUTH_COMPLETE_POLL_INTERVAL = 2000;

type Step =
  | "no-auth"
  | "auth-started" // loading
  | "auth-complete"
  | "setting-folder"
  | "folder-saved";

export function GSheetManagement() {
  const [step, setStep] = useState<Step>("no-auth");
  const gSheetsSetting = useSetting("gsheets");
  const gSheetsEnabled = useSetting("show-google-sheets-integration");

  useEffect(() => {
    setStep(gSheetsSetting?.status ?? "no-auth");
  }, [gSheetsSetting]);

  const showModal = !["no-auth", "folder-saved"].includes(step);
  const showButton = step !== "folder-saved";
  const showStatus = step === "folder-saved";

  if (!gSheetsEnabled) {
    return null;
  }

  return (
    <>
      <Box py="lg" mx="md">
        <Divider />
        <Box py="lg">
          <Box>
            {showStatus && (
              <Text
                mb="md"
                color="text-medium"
                component="a"
                href={gSheetsSetting?.folder_url ?? ""}
              >
                {c("{0} is the name of a google drive folder")
                  .t`Folder is connected`}
              </Text>
            )}
            {showButton && (
              <Button
                variant="filled"
                onClick={() =>
                  setStep(
                    step === "auth-complete"
                      ? "setting-folder"
                      : "auth-started",
                  )
                }
              >
                {t`Connect Google Sheets Folder`}
              </Button>
            )}
          </Box>
        </Box>
        <Divider />
      </Box>
      {showModal && (
        <GoogleSheetsConnectModal
          step={step}
          setStep={setStep}
          onClose={() => setStep("no-auth") /* FIXME this is more complex */}
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
  <Modal
    opened
    title={t`Connect Google Sheets Folder`}
    onClose={onClose}
    size="lg"
  >
    <Flex py="lg" gap="md" direction="column">
      {children}
    </Flex>
  </Modal>
);

function GoogleSheetsConnectModal({
  step,
  setStep,
  onClose,
}: {
  step: Step;
  setStep: (newStep: Step) => void;
  onClose: () => void;
}) {
  const [folderLink, setFolderLink] = useState("");

  const { data: oauthStatus } = useGetGsheetsOauthStatusQuery(
    step === "auth-started" ? undefined : skipToken,
    {
      pollingInterval: AUTH_COMPLETE_POLL_INTERVAL,
      skipPollingIfUnfocused: true,
    },
  );

  const [initiateOauth, { isLoading: isLoadingOauthLink, data: oauthLink }] =
    useInitiateOauthMutation();

  const [saveFolderLink, { isLoading: isSavingFolderLink }] =
    useSaveGsheetsFolderLinkMutation();

  useEffect(() => {
    if (step === "auth-started" && oauthStatus?.oauth_setup) {
      setStep("auth-complete");
    }
  }, [step, setStep, oauthStatus]);

  useEffect(() => {
    if (step === "auth-started") {
      initiateOauth({ redirect_url: window.location.href });
    }
  }, [initiateOauth, step, setStep, oauthStatus]);

  if (step === "auth-started") {
    return (
      <ModalWrapper onClose={onClose}>
        <Center>
          <Button
            loading={isLoadingOauthLink || !oauthLink}
            variant="filled"
            component="a"
            href={oauthLink?.oauth_url ?? undefined}
            target="_blank"
          >
            {isLoadingOauthLink
              ? t`Getting authorization link`
              : t`Authorize Google Sheets`}
          </Button>
        </Center>
      </ModalWrapper>
    );
  }

  if (step === "auth-complete") {
    return (
      <ModalWrapper onClose={onClose}>
        <TextInput
          disabled={isSavingFolderLink}
          label={t`Google Drive folder url`}
          value={folderLink}
          onChange={e => setFolderLink(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/abc123-xyz456"
        />
        <Button
          variant="filled"
          loading={isSavingFolderLink}
          disabled={folderLink.length < 3}
          onClick={async () => {
            const response = await saveFolderLink({
              url: folderLink.trim(),
            }).unwrap();

            if (response.success) {
              setStep("folder-saved");
            }
          }}
        >
          {t`Sync folder`}
        </Button>
      </ModalWrapper>
    );
  }

  return null;
}
