import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { t } from "ttag";

import "react-resizable/css/styles.css";

import { Box, Button, Card, Group, Stack } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedNavigation } from "../hooks";

import { SdkIframeEmbedPreview } from "./SdkIframeEmbedPreview";
import S from "./SdkIframeEmbedSetup.module.css";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";

const SdkIframeEmbedSetupContent = () => {
  const { currentStep } = useSdkIframeEmbedSetupContext();

  const {
    handleNext,
    handleBack,
    canGoNext,
    canGoBack,
    isLastStep,
    StepContent,
  } = useSdkIframeEmbedNavigation();

  return (
    <Box className={S.Container}>
      <SidebarResizer>
        <Box className={S.Sidebar}>
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
      handle={<Box className={S.ResizeHandle} />}
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
