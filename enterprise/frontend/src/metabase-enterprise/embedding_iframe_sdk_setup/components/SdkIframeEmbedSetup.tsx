import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { t } from "ttag";

import "react-resizable/css/styles.css";

import { Box, Button, Card, Group, Stack, Text } from "metabase/ui";

import type { EmbedPreviewOptions, Step } from "../types";

import { ConfigureStep } from "./ConfigureStep";
import { GetCodeStep } from "./GetCodeStep";
import { SdkIframeEmbedPreview } from "./SdkIframeEmbedPreview";
import S from "./SdkIframeEmbedSetup.module.css";
import { SelectEntityStep } from "./SelectEntityStep";
import { SelectTypeStep } from "./SelectTypeStep";

// Main Component
export const SdkIframeEmbedSetup = () => {
  const [currentStep, setCurrentStep] = useState<Step>("select-type");
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [options, setOptions] = useState<EmbedPreviewOptions>({
    selectedType: "dashboard",
    selectedDashboard: null,
    selectedQuestion: null,
    dashboardOptions: {
      isDrillThroughEnabled: false,
      withDownloads: false,
      withTitle: true,
      initialParameters: {},
      hiddenParameters: [],
    },
    questionOptions: {
      isDrillThroughEnabled: false,
      withDownloads: false,
      withTitle: true,
      initialSqlParameters: {},
    },
  });

  const handleNext = () => {
    if (currentStep === "select-type") {
      setCurrentStep("select-entity");
    } else if (currentStep === "select-entity") {
      setCurrentStep("configure");
    } else if (currentStep === "configure") {
      setCurrentStep("get-code");
    }
  };

  const handleBack = () => {
    if (currentStep === "select-entity") {
      setCurrentStep("select-type");
    } else if (currentStep === "configure") {
      setCurrentStep("select-entity");
    } else if (currentStep === "get-code") {
      setCurrentStep("configure");
    }
  };

  const handleOptionsChange = (newOptions: Partial<EmbedPreviewOptions>) => {
    setOptions((prev) => ({ ...prev, ...newOptions }));
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case "select-type":
        return (
          <SelectTypeStep
            selectedType={options.selectedType}
            onTypeChange={(type) => handleOptionsChange({ selectedType: type })}
          />
        );
      case "select-entity":
        return <SelectEntityStep />;
      case "configure":
        return (
          <ConfigureStep
            options={options}
            onOptionsChange={handleOptionsChange}
          />
        );
      case "get-code":
        return <GetCodeStep />;
      default:
        return null;
    }
  };

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
          <Box className={S.SidebarContent}>{renderStepContent()}</Box>
          <Group className={S.Navigation} justify="space-between">
            <Button
              variant="default"
              onClick={handleBack}
              disabled={currentStep === "select-type"}
            >
              {t`Back`}
            </Button>
            {currentStep !== "get-code" && (
              <Button
                variant="filled"
                onClick={handleNext}
                disabled={
                  currentStep === "select-entity" && !options.selectedDashboard
                }
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
            <Text size="lg" fw="bold" mb="md">
              {t`Preview`}
            </Text>
            <SdkIframeEmbedPreview />
          </Stack>
        </Card>
      </Box>
    </Box>
  );
};
