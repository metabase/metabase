import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { t } from "ttag";

import "react-resizable/css/styles.css";

import noResultsSource from "assets/img/no_results.svg";
import { useSetting } from "metabase/common/hooks";
import { Box, Button, Card, Flex, Group, Image, Stack } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedNavigation } from "../hooks";

import { SdkIframeEmbedPreview } from "./SdkIframeEmbedPreview";
import S from "./SdkIframeEmbedSetup.module.css";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";

const SdkIframeEmbedSetupContent = () => {
  const { currentStep } = useSdkIframeEmbedSetupContext();

  const isSimpleEmbeddingEnabled = useSetting("enable-embedding-simple");

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
        <Box className={S.Sidebar} component="aside">
          <Box className={S.SidebarContent}>
            <StepContent />
          </Box>

          <Group className={S.Navigation} justify="space-between">
            <Button
              variant="default"
              onClick={handleBack}
              disabled={!canGoBack || !isSimpleEmbeddingEnabled}
            >
              {t`Back`}
            </Button>

            {!isLastStep && (
              <Button
                variant="filled"
                onClick={handleNext}
                disabled={!canGoNext || !isSimpleEmbeddingEnabled}
              >
                {currentStep === "select-embed-options" ? t`Get Code` : t`Next`}
              </Button>
            )}
          </Group>
        </Box>
      </SidebarResizer>

      <Box className={S.PreviewPanel}>
        <Stack h="100%">
          {isSimpleEmbeddingEnabled ? (
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

export const SdkIframeEmbedSetup = () => (
  <SdkIframeEmbedSetupProvider>
    <SdkIframeEmbedSetupContent />
  </SdkIframeEmbedSetupProvider>
);
