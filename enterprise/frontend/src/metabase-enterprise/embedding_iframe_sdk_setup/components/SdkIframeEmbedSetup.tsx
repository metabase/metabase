import { useEffect, useState } from "react";
import { ResizableBox } from "react-resizable";
import { useLocation } from "react-use";
import { t } from "ttag";

import "react-resizable/css/styles.css";

import { useUpdateSettingsMutation } from "metabase/api";
import { useSetting, useToast } from "metabase/common/hooks";
import { Box, Button, Group, Icon, Stack } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedNavigation } from "../hooks";

import { SdkIframeEmbedPreview } from "./SdkIframeEmbedPreview";
import S from "./SdkIframeEmbedSetup.module.css";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";
import { SimpleEmbedTermsCard } from "./SimpleEmbedTermsCard";

const SdkIframeEmbedSetupContent = () => {
  const {
    currentStep,
    settings,
    updateSettings: updateEmbedSettings,
  } = useSdkIframeEmbedSetupContext();

  const isSimpleEmbeddingEnabled = useSetting("enable-embedding-simple");
  const showSimpleEmbedTerms = useSetting("show-simple-embed-terms");
  const [updateSettings] = useUpdateSettingsMutation();
  const [sendToast] = useToast();
  const location = useLocation();

  const {
    handleNext,
    handleBack,
    canGoNext,
    canGoBack,
    isLastStep,
    StepContent,
  } = useSdkIframeEmbedNavigation();

  // The embed disclaimer is only shown once per instance.
  // If an admin accepts the terms, we never show it again.
  const acceptSimpleEmbedTerms = () =>
    updateSettings({ "show-simple-embed-terms": false });

  const handleGetCode = () => {
    const isUsingSSO = !settings.useExistingUserSession;

    if (isUsingSSO) {
      updateSettings({
        "embedding-hub-production-embed-snippet-created": true,
      });
    } else {
      updateSettings({ "embedding-hub-test-embed-snippet-created": true });
    }

    handleNext();
  };

  const handleDone = () => {
    window.history.back();
  };

  // Automatically enable embedding if it's not already enabled.
  useEffect(() => {
    if (!isSimpleEmbeddingEnabled) {
      updateSettings({ "enable-embedding-simple": true });

      sendToast({
        message: t`Embedded Analytics JS is enabled. You can configure it in admin settings.`,
      });
    }
  }, [isSimpleEmbeddingEnabled, sendToast, updateSettings]);

  // Set initial auth method based on URL parameter
  useEffect(() => {
    if (location?.search) {
      const searchParams = new URLSearchParams(location.search);
      const authMethod = searchParams.get("auth_method");
      if (authMethod === "sso") {
        updateEmbedSettings({ useExistingUserSession: false });
      } else if (authMethod === "user_session") {
        updateEmbedSettings({ useExistingUserSession: true });
      }
    }
  }, [location, updateEmbedSettings]);

  return (
    <Box className={S.Container}>
      <SidebarResizer>
        <Box className={S.Sidebar} component="aside">
          <Box className={S.SidebarContent}>
            <StepContent />
          </Box>

          <Group className={S.Navigation} justify="space-between">
            <Button
              variant="default"
              onClick={handleBack}
              disabled={!canGoBack}
            >
              {t`Back`}
            </Button>

            {!isLastStep && (
              <Button
                variant="filled"
                onClick={
                  currentStep === "select-embed-options"
                    ? handleGetCode
                    : handleNext
                }
                disabled={!canGoNext}
              >
                {currentStep === "select-embed-options" ? t`Get Code` : t`Next`}
              </Button>
            )}

            {isLastStep && (
              <Button
                variant="filled"
                onClick={handleDone}
                leftSection={<Icon name="check_filled" />}
              >
                {t`Done`}
              </Button>
            )}
          </Group>
        </Box>
      </SidebarResizer>

      <Box className={S.PreviewPanel}>
        <Stack h="100%">
          {/** Only show the embed preview once the embedding is auto-enabled, or already enabled. */}
          {isSimpleEmbeddingEnabled && <SdkIframeEmbedPreview />}
        </Stack>
      </Box>

      {showSimpleEmbedTerms && (
        <SimpleEmbedTermsCard onAccept={acceptSimpleEmbedTerms} />
      )}
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

export const SdkIframeEmbedSetup = () => (
  <SdkIframeEmbedSetupProvider>
    <SdkIframeEmbedSetupContent />
  </SdkIframeEmbedSetupProvider>
);
