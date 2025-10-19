import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { match } from "ts-pattern";
import { t } from "ttag";

import "react-resizable/css/styles.css";

import noResultsSource from "assets/img/no_results.svg";
import { useUpdateSettingsMutation } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import {
  Box,
  Button,
  Card,
  Flex,
  Group,
  Icon,
  Image,
  Stack,
} from "metabase/ui";
import { SdkIframeStaticEmbeddingStatusBar } from "metabase-enterprise/embedding_iframe_sdk_setup/components/SdkIframeStaticEmbeddingStatusBar";
import type { SettingKey } from "metabase-types/api";

import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedNavigation } from "../hooks";

import { SdkIframeEmbedPreview } from "./SdkIframeEmbedPreview";
import S from "./SdkIframeEmbedSetup.module.css";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";

export const SdkIframeEmbedSetupContent = () => {
  const [updateSettings] = useUpdateSettingsMutation();
  const { currentStep, settings } = useSdkIframeEmbedSetupContext();

  const isSimpleEmbeddingEnabled = useSetting("enable-embedding-simple");
  const isStaticEmbedding = !!settings.isStatic;

  const { handleNext, handleBack, canGoBack, StepContent } =
    useSdkIframeEmbedNavigation();

  function handleEmbedDone() {
    // Embedding Hub: track step completion
    const settingKey: SettingKey = settings.useExistingUserSession
      ? "embedding-hub-test-embed-snippet-created"
      : "embedding-hub-production-embed-snippet-created";

    updateSettings({ [settingKey]: true });

    window.history.back();
  }

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
      <Button variant="filled" onClick={handleNext}>
        {t`Get code`}
      </Button>
    ))
    .otherwise(() => (
      <Button
        variant="filled"
        onClick={handleNext}
        disabled={!isSimpleEmbeddingEnabled}
      >
        {t`Next`}
      </Button>
    ));

  return (
    <Box className={S.Container}>
      <SidebarResizer>
        <Box className={S.Sidebar} component="aside">
          <Stack className={S.SidebarContent} gap="md">
            <Box style={{ flexShrink: 0 }}>
              <SdkIframeStaticEmbeddingStatusBar />
            </Box>

            <StepContent />
          </Stack>

          <Group className={S.Navigation} justify="space-between">
            <Button
              variant="default"
              onClick={handleBack}
              disabled={!canGoBack || !isSimpleEmbeddingEnabled}
            >
              {t`Back`}
            </Button>

            {nextStepButton}
          </Group>
        </Box>
      </SidebarResizer>

      <Box className={S.PreviewPanel}>
        <Stack h="100%">
          {isSimpleEmbeddingEnabled || isStaticEmbedding ? (
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
