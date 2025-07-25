import { useEffect, useState } from "react";
import { ResizableBox } from "react-resizable";
import { t } from "ttag";

import "react-resizable/css/styles.css";

import { useUpdateSettingsMutation } from "metabase/api";
import { useSetting, useToast } from "metabase/common/hooks";
import { Box, Button, Card, Group, Stack } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedNavigation } from "../hooks";

import { SdkIframeEmbedPreview } from "./SdkIframeEmbedPreview";
import S from "./SdkIframeEmbedSetup.module.css";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";
import { SimpleEmbedTermsCard } from "./SimpleEmbedTermsCard";

const SdkIframeEmbedSetupContent = () => {
  const { currentStep } = useSdkIframeEmbedSetupContext();

  // TODO: change this to "enable-embedding-simple" when we split the settings
  const embeddingSdkEnabled = useSetting("enable-embedding-sdk");
  const showSimpleEmbedTerms = useSetting("show-simple-embed-terms");
  const [updateSettings] = useUpdateSettingsMutation();
  const [sendToast] = useToast();

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

  // Automatically enable the embedding SDK if it's not already enabled.
  useEffect(() => {
    // TODO: change this to "enable-embedding-simple" when we split the settings
    if (!embeddingSdkEnabled) {
      updateSettings({ "enable-embedding-sdk": true });

      sendToast({
        // TODO: change this to simple embedding when we split the settings
        message: t`Embedded Analytics SDK is enabled. You can configure it in admin settings.`,
      });
    }
  }, [embeddingSdkEnabled, sendToast, updateSettings]);

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
                onClick={handleNext}
                disabled={!canGoNext}
              >
                {currentStep === "select-embed-options" ? t`Get Code` : t`Next`}
              </Button>
            )}
          </Group>
        </Box>
      </SidebarResizer>

      <Box className={S.PreviewPanel}>
        <Card p="md" h="100%">
          <Stack h="100%">
            {/** Only show the embed preview once the embedding is auto-enabled, or already enabled. */}
            {embeddingSdkEnabled && <SdkIframeEmbedPreview />}
          </Stack>
        </Card>
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
