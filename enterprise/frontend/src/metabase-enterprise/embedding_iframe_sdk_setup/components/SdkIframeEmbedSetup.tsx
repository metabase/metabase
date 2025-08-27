import { useEffect, useState } from "react";
import { ResizableBox } from "react-resizable";
import { match } from "ts-pattern";
import { t } from "ttag";

import "react-resizable/css/styles.css";

import { useUpdateSettingsMutation } from "metabase/api";
import { useSetting, useToast } from "metabase/common/hooks";
import { Box, Button, Group, Icon, Stack } from "metabase/ui";
import type { SettingKey } from "metabase-types/api";

import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedNavigation } from "../hooks";

import { SdkIframeEmbedPreview } from "./SdkIframeEmbedPreview";
import S from "./SdkIframeEmbedSetup.module.css";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";
import { SimpleEmbedTermsCard } from "./SimpleEmbedTermsCard";

const SdkIframeEmbedSetupContent = () => {
  const { currentStep, settings } = useSdkIframeEmbedSetupContext();

  const isSimpleEmbeddingEnabled = useSetting("enable-embedding-simple");
  const showSimpleEmbedTerms = useSetting("show-simple-embed-terms");
  const [updateSettings] = useUpdateSettingsMutation();
  const [sendToast] = useToast();

  const { handleNext, handleBack, canGoBack, StepContent } =
    useSdkIframeEmbedNavigation();

  // The embed disclaimer is only shown once per instance.
  // If an admin accepts the terms, we never show it again.
  const acceptSimpleEmbedTerms = () =>
    updateSettings({ "show-simple-embed-terms": false });

  function trackSnippetCreated() {
    // Embedding Hub: track test and production embed snippets separately.
    const settingKey: SettingKey = settings.useExistingUserSession
      ? "embedding-hub-test-embed-snippet-created"
      : "embedding-hub-production-embed-snippet-created";

    updateSettings({ [settingKey]: true });
  }

  function handleGetCode() {
    trackSnippetCreated();
    handleNext();
  }

  function handleEmbedDone() {
    trackSnippetCreated();
    window.history.back();
  }

  // Automatically enable embedding if it's not already enabled.
  useEffect(() => {
    if (!isSimpleEmbeddingEnabled) {
      updateSettings({ "enable-embedding-simple": true });

      sendToast({
        message: t`Embedded Analytics JS is enabled. You can configure it in admin settings.`,
      });
    }
  }, [isSimpleEmbeddingEnabled, sendToast, updateSettings]);

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
      <Button variant="filled" onClick={handleGetCode}>
        {t`Get Code`}
      </Button>
    ))
    .otherwise(() => (
      <Button variant="filled" onClick={handleNext}>
        {t`Next`}
      </Button>
    ));

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

            {nextStepButton}
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
