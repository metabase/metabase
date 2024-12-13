import { useEffect, useState } from "react";
import { c, t } from "ttag";

import { skipToken, useGetSettingQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import {
  Box,
  Button,
  Center,
  Divider,
  Flex,
  Loader,
  Modal,
  Text,
  TextInput,
} from "metabase/ui";
import {
  useGetGsheetsOauthLinkQuery,
  useSaveGsheetsFolderLinkMutation,
} from "metabase-enterprise/api";

const AUTH_COMPLETE_POLL_INTERVAL = 2000;

type Step =
  | "no-auth"
  | "get-setup-link" // loading
  | "auth-clicked" // loading
  | "auth-complete"
  | "setting-folder"
  | "folder-saved";

export function GSheetManagement() {
  const [step, setStep] = useState<Step>("no-auth");
  const gSheetsSetting = useSetting("gsheets");

  useEffect(() => {
    setStep(gSheetsSetting?.status ?? "no-auth");
  }, [gSheetsSetting]);

  const showModal = !["no-auth", "folder-saved"].includes(step);
  const showButton = step !== "folder-saved";
  const showStatus = step === "folder-saved";

  return (
    <>
      <Box py="lg" mx="md">
        <Divider />
        <Box py="lg">
          <Box>
            {showStatus && (
              <Text mb="md" color="text-medium">
                {c("{0} is the name of a google drive folder")
                  .t`${gSheetsSetting.folder_name} is connected`}
              </Text>
            )}
            {showButton && (
              <Button
                variant="filled"
                onClick={() =>
                  setStep(
                    step === "auth-complete"
                      ? "setting-folder"
                      : "get-setup-link",
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
  const { data: oauthLink, isLoading: isLoadingOauthLink } =
    useGetGsheetsOauthLinkQuery(
      step === "get-setup-link" ? undefined : skipToken,
    );

  const { data: gSheetsSetting } = useGetSettingQuery(
    step === "auth-clicked" ? "gsheets" : skipToken,
    {
      pollingInterval: AUTH_COMPLETE_POLL_INTERVAL,
      skipPollingIfUnfocused: true,
    },
  );

  const [saveFolderLink, { isLoading: isSavingFolderLink }] =
    useSaveGsheetsFolderLinkMutation();

  useEffect(() => {
    if (step === "auth-clicked" && gSheetsSetting?.status === "auth-complete") {
      setStep("auth-complete");
    }
  }, [step, setStep, gSheetsSetting]);

  if (step === "get-setup-link") {
    return (
      <ModalWrapper onClose={onClose}>
        <Center>
          <Button
            loading={isLoadingOauthLink}
            variant="filled"
            component="a"
            href={oauthLink?.oauth_url}
            onClick={() => setStep("auth-clicked")}
          >
            {isLoadingOauthLink
              ? t`Getting authorization link`
              : t`Authorize Google Sheets`}
          </Button>
        </Center>
      </ModalWrapper>
    );
  }

  if (step === "auth-clicked") {
    return (
      <ModalWrapper onClose={onClose}>
        <Center>
          <Text>{t`Loading...`}</Text>
          <Loader />
        </Center>
      </ModalWrapper>
    );
  }

  if (step === "auth-complete") {
    return (
      <ModalWrapper onClose={onClose}>
        <TextInput
          label={t`Google Drive folder url`}
          placeholder="https://drive.google.com/drive/folders/abc123-xyz456"
        />
        <Button
          variant="filled"
          loading={isSavingFolderLink}
          onClick={async () => {
            await saveFolderLink({
              url: "https://drive.google.com/drive/folders/abc123-xyz456",
            });
            // TODO handle error
          }}
        >
          {t`Sync folder`}
        </Button>
      </ModalWrapper>
    );
  }

  return null;
}
