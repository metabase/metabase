import { useMemo, useState } from "react";
import { ResizableBox } from "react-resizable";
import { match } from "ts-pattern";
import { t } from "ttag";

import "react-resizable/css/styles.css";

import { Box, Button, Card, Group, Stack } from "metabase/ui";

import { SdkIframeEmbedPreview } from "./SdkIframeEmbedPreview";
import S from "./SdkIframeEmbedSetup.module.css";
import {
  SdkIframeEmbedSetupProvider,
  useSdkIframeEmbedSetupContext,
} from "./SdkIframeEmbedSetupContext";
import { SelectEmbedTypeStep } from "./SelectEmbedTypeStep";

const SdkIframeEmbedSetupContent = () => {
  const [sidebarWidth, setSidebarWidth] = useState(400);

  const {
    embedType: selectedType,
    currentStep,
    setCurrentStep,
  } = useSdkIframeEmbedSetupContext();

  const handleNext = () => {
    if (currentStep === "select-embed-type") {
      // Skip select-entity for exploration
      if (selectedType === "exploration") {
        setCurrentStep("configure");
      } else {
        setCurrentStep("select-entity");
      }
    } else if (currentStep === "select-entity") {
      setCurrentStep("configure");
    } else if (currentStep === "configure") {
      setCurrentStep("get-code");
    }
  };

  const handleBack = () => {
    if (currentStep === "select-entity") {
      setCurrentStep("select-embed-type");
    } else if (currentStep === "configure") {
      // Skip select-entity for exploration
      if (selectedType === "exploration") {
        setCurrentStep("select-embed-type");
      } else {
        setCurrentStep("select-entity");
      }
    } else if (currentStep === "get-code") {
      setCurrentStep("configure");
    }
  };

  const canGoNext = currentStep !== "get-code";
  const canGoBack = currentStep !== "select-embed-type";

  const StepContent = useMemo(() => {
    return match(currentStep)
      .with("select-embed-type", () => SelectEmbedTypeStep)
      .with("select-entity", () => () => null)
      .with("configure", () => () => null)
      .with("get-code", () => () => null)
      .exhaustive();
  }, [currentStep]);

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

export const SdkIframeEmbedSetup = () => {
  return (
    <SdkIframeEmbedSetupProvider>
      <SdkIframeEmbedSetupContent />
    </SdkIframeEmbedSetupProvider>
  );
};
