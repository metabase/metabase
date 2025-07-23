import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { t } from "ttag";

import "react-resizable/css/styles.css";

import { useUpdateSettingsMutation } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { Box, Button, Card, Group, Stack } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedNavigation } from "../hooks";

import { AntiAbuseMessage } from "./AntiAbuseMessage";
import { SdkIframeEmbedPreview } from "./SdkIframeEmbedPreview";
import S from "./SdkIframeEmbedSetup.module.css";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";

const SdkIframeEmbedSetupContent = () => {
  const { currentStep } = useSdkIframeEmbedSetupContext();
  const showSimpleEmbedTerms = useSetting("show-simple-embed-terms");
  const embeddingSdkEnabled = useSetting("enable-embedding-sdk");
  const [updateSettings] = useUpdateSettingsMutation();

  const {
    handleNext,
    handleBack,
    canGoNext,
    canGoBack,
    isLastStep,
    StepContent,
  } = useSdkIframeEmbedNavigation();

  const handleAcceptAntiAbuseTerms = async () => {
    await updateSettings({
      "show-simple-embed-terms": false,
      "enable-embedding-sdk": true,
    });
  };

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
            <SdkIframeEmbedPreview />
          </Stack>
        </Card>
      </Box>

      {showSimpleEmbedTerms && !embeddingSdkEnabled && (
        <AntiAbuseMessage onAccept={handleAcceptAntiAbuseTerms} />
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
