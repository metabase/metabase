import cx from "classnames";
import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { match } from "ts-pattern";
import { t } from "ttag";

import "react-resizable/css/styles.css";

import noResultsSource from "assets/img/no_results.svg";
import { useUpdateSettingsMutation } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { SdkIframeGuestEmbedStatusBar } from "metabase/embedding/embedding-iframe-sdk-setup/components/SdkIframeGuestEmbedStatusBar";
import { SdkIframeStepHeader } from "metabase/embedding/embedding-iframe-sdk-setup/components/SdkIframeStepHeader";
import { useDispatch } from "metabase/lib/redux";
import type { SdkIframeEmbedSetupModalProps } from "metabase/plugins";
import { closeModal } from "metabase/redux/ui";
import {
  Box,
  Button,
  Card,
  Flex,
  Group,
  Icon,
  Image,
  Modal,
  Stack,
} from "metabase/ui";
import type { SettingKey } from "metabase-types/api";

import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedNavigation } from "../hooks";

import { SdkIframeEmbedPreview } from "./SdkIframeEmbedPreview";
import S from "./SdkIframeEmbedSetup.module.css";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";

export const SdkIframeEmbedSetupContent = () => {
  const dispatch = useDispatch();
  const [updateSettings] = useUpdateSettingsMutation();
  const {
    isSimpleEmbedFeatureAvailable,
    isSimpleEmbeddingEnabled,
    isSimpleEmbeddingTermsAccepted,
    isGuestEmbedsEnabled,
    isGuestEmbedsTermsAccepted,
    currentStep,
    settings,
  } = useSdkIframeEmbedSetupContext();

  const { handleNext, handleBack, canGoBack, StepContent } =
    useSdkIframeEmbedNavigation();

  function handleEmbedDone() {
    // Embedding Hub: track step completion
    const settingKey: SettingKey = settings.useExistingUserSession
      ? "embedding-hub-test-embed-snippet-created"
      : "embedding-hub-production-embed-snippet-created";

    updateSettings({ [settingKey]: true });

    dispatch(closeModal());
  }

  const allowPreviewAndNavigation = isSimpleEmbedFeatureAvailable
    ? isSimpleEmbeddingEnabled && isSimpleEmbeddingTermsAccepted
    : isGuestEmbedsEnabled && isGuestEmbedsTermsAccepted;

  const nextStepButton = match(currentStep)
    .with("get-code", () => (
      <Button
        variant="filled"
        onClick={handleEmbedDone}
        leftSection={<Icon name="check_filled" />}
      >
        {t`Done`}
      </Button>
    ))
    .with("select-embed-options", () => (
      <Button
        variant="filled"
        disabled={!allowPreviewAndNavigation}
        onClick={handleNext}
      >
        {t`Get code`}
      </Button>
    ))
    .otherwise(() => (
      <Button
        variant="filled"
        onClick={handleNext}
        disabled={!allowPreviewAndNavigation}
      >
        {t`Next`}
      </Button>
    ));

  return (
    <Box
      className={S.Container}
      data-testid="sdk-iframe-embed-setup-modal-content"
    >
      <SidebarResizer>
        <Box className={S.Sidebar} component="aside">
          <Stack className={S.SidebarContent} gap="md">
            <Stack gap="md">
              <SdkIframeStepHeader />

              <Stack
                gap="md"
                opacity={allowPreviewAndNavigation ? 1 : 0.5}
                className={cx(
                  !allowPreviewAndNavigation && CS.pointerEventsNone,
                )}
              >
                <StepContent />
              </Stack>
            </Stack>
          </Stack>

          <Group className={S.Navigation} justify="space-between">
            <Button
              variant="default"
              onClick={handleBack}
              disabled={!canGoBack || !allowPreviewAndNavigation}
            >
              {t`Back`}
            </Button>

            {nextStepButton}
          </Group>
        </Box>
      </SidebarResizer>

      <Box className={S.PreviewPanel}>
        <Stack h="100%">
          <Modal.CloseButton />

          <SdkIframeGuestEmbedStatusBar />

          {allowPreviewAndNavigation ? (
            <SdkIframeEmbedPreview />
          ) : (
            <Card h="100%">
              <Flex h="100%" align="center" justify="center">
                <Image w={120} h={120} src={noResultsSource} alt="No results" />
              </Flex>
            </Card>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

const SidebarResizer = ({ children }: { children: React.ReactNode }) => {
  const [sidebarWidth, setSidebarWidth] = useState(400);

  return (
    <ResizableBox
      width={sidebarWidth}
      height={Infinity}
      minConstraints={[300, Infinity]}
      maxConstraints={[600, Infinity]}
      onResizeStop={(_, data) => setSidebarWidth(data.size.width)}
      axis="x"
      handle={<div className={S.ResizeHandle} />}
    >
      {children}
    </ResizableBox>
  );
};

export const SdkIframeEmbedSetupModal = ({
  opened,
  onClose,
  initialState,
}: SdkIframeEmbedSetupModalProps) => (
  <Modal
    opened={opened}
    fullScreen
    withCloseButton={false}
    transitionProps={{ transition: "fade", duration: 200 }}
    onClose={onClose}
  >
    <Modal.Content style={{ overflow: "hidden" }}>
      <SdkIframeEmbedSetupProvider
        initialState={initialState}
        onClose={onClose}
      >
        <SdkIframeEmbedSetupContent />
      </SdkIframeEmbedSetupProvider>
    </Modal.Content>
  </Modal>
);
