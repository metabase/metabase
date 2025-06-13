import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { match } from "ts-pattern";
import { t } from "ttag";

import "react-resizable/css/styles.css";

import { Box, Button, Card, Group, Stack } from "metabase/ui";

import { ConfigureStep } from "./ConfigureStep";
import { GetCodeStep } from "./GetCodeStep";
import { SdkIframeEmbedPreview } from "./SdkIframeEmbedPreview";
import S from "./SdkIframeEmbedSetup.module.css";
import {
  SdkIframeEmbedSetupProvider,
  useSdkIframeEmbedSetupContext,
} from "./SdkIframeEmbedSetupContext";
import { SelectEntityStep } from "./SelectEntityStep";
import { SelectTypeStep } from "./SelectTypeStep";

const SdkIframeEmbedSetupContent = () => {
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const { currentStep, handleNext, handleBack, canGoNext, canGoBack } =
    useSdkIframeEmbedSetupContext();

  const StepContent = match(currentStep)
    .with("select-type", () => SelectTypeStep)
    .with("select-entity", () => SelectEntityStep)
    .with("configure", () => ConfigureStep)
    .with("get-code", () => GetCodeStep)
    .exhaustive();

  return (
    <Box className={S.Container}>
      <ResizableBox
        width={sidebarWidth}
        height={Infinity}
        minConstraints={[300, Infinity]}
        maxConstraints={[600, Infinity]}
        onResizeStop={(_, data) => setSidebarWidth(data.size.width)}
        axis="x"
        handle={<Box className={S.ResizeHandle} />}
      >
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
            {currentStep !== "get-code" && (
              <Button
                variant="filled"
                onClick={handleNext}
                disabled={!canGoNext}
              >
                {currentStep === "configure" ? t`Get Code` : t`Next`}
              </Button>
            )}
          </Group>
        </Box>
      </ResizableBox>

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

// Main Component with Provider
export const SdkIframeEmbedSetup = () => {
  return (
    <SdkIframeEmbedSetupProvider>
      <SdkIframeEmbedSetupContent />
    </SdkIframeEmbedSetupProvider>
  );
};
